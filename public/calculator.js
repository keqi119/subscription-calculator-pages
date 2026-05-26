const DEFAULTS = {
  vehiclePrice: 271000,
  plateUseFee: 18000,
  initialAge: 28,
  deposit: 24330,
  serviceFee1: 15000,
  serviceFee2: 0,
  customerTerm: 36,
  paymentMode: 0,
  monthlyRent: 12162,
  rentAdjustments: { 1: 12168 },
  buyoutPrice: 2000,
  startDate: "2026-05-01",
  expectedRunMonths: 10,
  financeDownRatio: 0.1,
  financeDepositRatio: 0,
  financeFeeRatio: 0.01,
  financeTerm: 36,
  financePaymentMode: 0,
  financeRate: 0.12,
  financeBuyoutRatio: 100 / 289000,
  earlySettlePenalty: 0.03,
  maintenanceYear: 3000,
  insuranceYear: 10000,
  adminCostYear: 520000.04545794515,
  trafficCostYear: 634774.1154563739,
  leadPrice: 60,
  conversionRate: 0.030625066973774668,
  utilization: 0.9,
  commissionRate: 0.035,
  avgRunMonths: 10,
  salesCommission: 9485,
  batteryRent: 728,
  plateMonthlyFee: 0,
  refurbishFee: 600,
  gpsFee: 1000,
  depreciation: [
    { rate: 0.016666666666666666, from: 0, to: 12 },
    { rate: 0.01, from: 13, to: 24 },
    { rate: 0.008333333333333333, from: 25, to: 36 },
    { rate: 0.008333333333333333, from: 37, to: 48 },
    { rate: 0.006666666666666667, from: 49, to: 60 },
    { rate: 0.006666666666666667, from: 61, to: 72 },
    { rate: 0.006666666666666667, from: 73, to: 84 }
  ]
};

const form = document.querySelector("#calcForm");
const depreciationGrid = document.querySelector("#depreciationGrid");
const rentAdjustmentGrid = document.querySelector("#rentAdjustmentGrid");
let latestResult = null;
let lastCommissionSource = "rate";
let showAllRentAdjustments = false;

const moneyFmt = new Intl.NumberFormat("zh-CN", {
  style: "currency",
  currency: "CNY",
  maximumFractionDigits: 0
});
const numberFmt = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 });

function pmt(rate, periods, presentValue, futureValue = 0, type = 0) {
  if (periods === 0) return 0;
  if (Math.abs(rate) < 1e-10) return -(presentValue + futureValue) / periods;
  const factor = Math.pow(1 + rate, periods);
  return -(rate * (futureValue + factor * presentValue)) / ((1 + rate * type) * (factor - 1));
}

function fv(rate, periods, payment, presentValue, type = 0) {
  if (Math.abs(rate) < 1e-10) return -(presentValue + payment * periods);
  const factor = Math.pow(1 + rate, periods);
  return -(presentValue * factor + payment * (1 + rate * type) * (factor - 1) / rate);
}

function rate(periods, payment, presentValue, futureValue = 0, type = 0, guess = 0.1) {
  let r = guess;
  for (let i = 0; i < 80; i += 1) {
    const f = presentValue * Math.pow(1 + r, periods)
      + payment * (1 + r * type) * (Math.pow(1 + r, periods) - 1) / r
      + futureValue;
    const bump = r === 0 ? 1e-6 : Math.abs(r) * 1e-6;
    const r2 = r + bump;
    const f2 = presentValue * Math.pow(1 + r2, periods)
      + payment * (1 + r2 * type) * (Math.pow(1 + r2, periods) - 1) / r2
      + futureValue;
    const next = r - f / ((f2 - f) / bump);
    if (!Number.isFinite(next)) break;
    if (Math.abs(next - r) < 1e-10) return next;
    r = next;
  }
  return r;
}

function irr(cashflows, guess = 0.05) {
  let r = guess;
  for (let i = 0; i < 120; i += 1) {
    let npv = 0;
    let derivative = 0;
    cashflows.forEach((cashflow, period) => {
      const denominator = Math.pow(1 + r, period);
      npv += cashflow / denominator;
      if (period > 0) derivative -= period * cashflow / Math.pow(1 + r, period + 1);
    });
    if (Math.abs(derivative) < 1e-10) break;
    const next = r - npv / derivative;
    if (!Number.isFinite(next) || next <= -0.9999) break;
    if (Math.abs(next - r) < 1e-10) return next;
    r = next;
  }
  return r;
}

function asNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function addMonths(dateText, offset) {
  const date = new Date(`${dateText}T00:00:00`);
  date.setMonth(date.getMonth() + offset);
  return date.toISOString().slice(0, 10);
}

function depreciationRate(age, rows) {
  const matched = rows.find((row) => age >= row.from && age <= row.to);
  return matched ? matched.rate : 0;
}

function getInputs() {
  const data = { depreciation: [] };
  new FormData(form).forEach((value, key) => {
    data[key] = key === "startDate" ? (value || DEFAULTS.startDate) : asNumber(value);
  });
  data.rentAdjustments = {};
  rentAdjustmentGrid.querySelectorAll("[data-period]").forEach((field) => {
    data.rentAdjustments[asNumber(field.dataset.period)] = asNumber(field.value);
  });
  depreciationGrid.querySelectorAll(".depreciation-row").forEach((row) => {
    data.depreciation.push({
      rate: asNumber(row.querySelector("[data-field='rate']").value),
      from: asNumber(row.querySelector("[data-field='from']").value),
      to: asNumber(row.querySelector("[data-field='to']").value)
    });
  });
  return data;
}

function rentAdjustmentFor(input, period) {
  if (input.rentAdjustments && Object.prototype.hasOwnProperty.call(input.rentAdjustments, period)) {
    return asNumber(input.rentAdjustments[period]);
  }
  return 0;
}

function customerRentDueAt(input, item) {
  if (item > input.customerTerm) return { rentPlan: 0, rentAdjust: 0 };
  if (input.paymentMode === 1) {
    if (item >= input.customerTerm) return { rentPlan: 0, rentAdjust: 0 };
    const duePeriod = item + 1;
    return {
      rentPlan: input.monthlyRent,
      rentAdjust: rentAdjustmentFor(input, duePeriod)
    };
  }
  if (item === 0) return { rentPlan: 0, rentAdjust: 0 };
  return {
    rentPlan: input.monthlyRent,
    rentAdjust: rentAdjustmentFor(input, item)
  };
}

function calculate(input) {
  const vehicleTotal = input.vehiclePrice + input.plateUseFee;
  const runMonths = Math.max(0, Math.min(input.customerTerm, Math.round(input.expectedRunMonths || input.avgRunMonths)));
  const financeDownPayment = input.financeDownRatio * vehicleTotal;
  const financeDeposit = input.financeDepositRatio * vehicleTotal;
  const financeFee = input.financeFeeRatio * vehicleTotal;
  const financeBuyout = input.financeBuyoutRatio * vehicleTotal;
  const financeMonthlyRent = pmt(input.financeRate / 12, input.financeTerm, -vehicleTotal + financeDownPayment, financeBuyout, input.financePaymentMode);
  const financeIrr = rate(input.financeTerm, financeMonthlyRent, -vehicleTotal + financeDeposit + financeDownPayment + financeFee, financeBuyout - financeDeposit, input.financePaymentMode) * 12;
  const annualCapitalCost = financeIrr;
  const annualOrders = input.leadPrice === 0 ? 0 : input.trafficCostYear / input.leadPrice * input.conversionRate;
  const fleetScale = input.avgRunMonths === 0 || input.utilization === 0 ? 0 : annualOrders / 12 * input.avgRunMonths / input.utilization;
  const adminCostPerMonth = fleetScale === 0 ? 0 : input.adminCostYear / fleetScale;
  const customerRentCashflows = Array.from({ length: 61 }, (_, item) => {
    const period = item <= input.customerTerm ? item : "";
    if (period === "") return 0;
    const rentDue = customerRentDueAt(input, item);
    const initialOutflow = item === 0 ? -vehicleTotal + input.serviceFee1 + input.serviceFee2 : 0;
    return initialOutflow + rentDue.rentPlan + rentDue.rentAdjust;
  });
  const customerAnnualRate = irr(customerRentCashflows) * 12;
  const rows = [];

  for (let item = 0; item <= 60; item += 1) {
    const period = item <= input.customerTerm ? item : "";
    const inTerm = period !== "";
    const date = inTerm ? addMonths(input.startDate, item) : "";
    const service1 = item === 0 ? input.serviceFee1 : 0;
    const service2 = item === 0 ? input.serviceFee2 : 0;
    const depositIn = item === 0 ? input.deposit : 0;
    const rentDue = inTerm ? customerRentDueAt(input, item) : { rentPlan: 0, rentAdjust: 0 };
    const rentPlan = rentDue.rentPlan;
    const rentAdjust = rentDue.rentAdjust;
    const rent = rentPlan + rentAdjust;
    const buyout = period === input.customerTerm ? input.buyoutPrice : 0;
    const revenue = service1 + service2 + depositIn + rent + buyout;
    const insurance = inTerm && (period - 1) % 12 === 0 ? input.insuranceYear : 0;
    const commission = item === 0 ? input.salesCommission : 0;
    const battery = inTerm && period !== input.customerTerm ? input.batteryRent : 0;
    const plate = inTerm && period !== input.customerTerm ? input.plateMonthlyFee : 0;
    const refurbish = item === 0 ? input.refurbishFee : 0;
    const gps = item === 0 ? input.gpsFee : 0;
    const purchase = item === 0 ? vehicleTotal : 0;
    const depositRefund = inTerm && period === input.customerTerm ? input.deposit : 0;
    const cost = insurance + commission + battery + plate + refurbish + gps + purchase + depositRefund;
    const projectCashflow = revenue - cost;

    let rentPrincipal = 0;
    let rentInterest = 0;
    let remainingPrincipal = 0;
    if (item === 0) {
      remainingPrincipal = vehicleTotal;
    } else {
      const previous = rows[item - 1];
      rentInterest = previous.remainingPrincipal * customerAnnualRate / 12;
      rentPrincipal = rent - rentInterest;
      remainingPrincipal = previous.remainingPrincipal <= 0 ? 0 : previous.remainingPrincipal - rentPrincipal;
    }
    const riskExposure = Math.max(remainingPrincipal - input.deposit, 0);
    const age = inTerm ? input.initialAge + period : "";
    const depRate = age === "" ? 0 : depreciationRate(age, input.depreciation);
    const depAmount = input.vehiclePrice * depRate;
    const residual = item === 0 ? input.vehiclePrice - depAmount : age === "" ? 0 : rows[item - 1].residual - depAmount;
    const activeForProfit = inTerm && period <= runMonths;
    const capitalCost = activeForProfit && item > 0 ? rows[item - 1].riskExposure * annualCapitalCost / 12 : 0;
    const maintenance = activeForProfit && item > 0 ? input.maintenanceYear / 12 : 0;
    const insuranceCost = activeForProfit && item > 0 ? input.insuranceYear / 12 : 0;
    const batteryCost = activeForProfit && item > 0 ? battery : 0;
    const depreciationCost = activeForProfit && item > 0 ? depAmount : 0;
    const holdingCost = input.utilization === 0 ? 0 : (capitalCost + maintenance + insuranceCost + batteryCost + depreciationCost) / input.utilization;
    const acquisitionCost = item === 0 ? input.trafficCostYear / Math.max(fleetScale, 1) : 0;
    const commissionCost = item === 0 ? input.salesCommission : 0;
    const adminCost = activeForProfit && item > 0 ? adminCostPerMonth : 0;
    const operatingCost = holdingCost + acquisitionCost + commissionCost + adminCost;
    const serviceIncome = item === 0 ? input.serviceFee1 + input.serviceFee2 : 0;
    const rentIncome = activeForProfit ? rent : 0;
    const buyoutIncome = activeForProfit ? buyout * input.utilization : 0;
    const weightedIncome = serviceIncome + rentIncome + buyoutIncome;
    const operatingProfit = weightedIncome - operatingCost;
    const settleValue = fv(input.financeRate / 12, runMonths, financeMonthlyRent, -vehicleTotal + financeDownPayment, input.financePaymentMode) * (1 + input.earlySettlePenalty) - financeDeposit;
    const disposalProfit = period === runMonths ? residual - settleValue - financeDownPayment - financeFee : 0;

    rows.push({
      item,
      period,
      date,
      revenue,
      cost,
      projectCashflow,
      rentCashflow: customerRentCashflows[item],
      rent,
      rentAdjust,
      buyout,
      remainingPrincipal,
      riskExposure,
      age,
      depRate,
      residual,
      holdingCost,
      operatingCost,
      weightedIncome,
      operatingProfit,
      disposalProfit
    });
  }

  const initialPayment = rows[0].revenue;
  const totalOperatingProfit = rows.reduce((sum, row) => sum + row.operatingProfit, 0);
  const totalDisposalProfit = rows.reduce((sum, row) => sum + row.operatingProfit + row.disposalProfit, 0);

  return {
    input,
    rows,
    runMonths,
    vehicleTotal,
    financeDownPayment,
    financeDeposit,
    financeFee,
    financeBuyout,
    financeMonthlyRent,
    financeIrr,
    rentIrr: customerAnnualRate,
    annualOrders,
    fleetScale,
    initialPayment,
    initialRiskExposure: rows[0].riskExposure,
    initialRatio: vehicleTotal === 0 ? 0 : initialPayment / vehicleTotal,
    totalOperatingProfit,
    totalDisposalProfit,
    currentDepRate: depreciationRate(input.initialAge, input.depreciation)
  };
}

function fmtMoney(value) {
  return moneyFmt.format(Number.isFinite(value) ? value : 0);
}

function fmtPercent(value) {
  return `${((Number.isFinite(value) ? value : 0) * 100).toFixed(1)}%`;
}

function renderSummary(result) {
  document.querySelector("#operatingProfit").textContent = fmtMoney(result.totalOperatingProfit);
  document.querySelector("#disposalProfit").textContent = fmtMoney(result.totalDisposalProfit);
  document.querySelector("#initialPayment").textContent = fmtMoney(result.initialPayment);
  document.querySelector("#riskExposure").textContent = fmtMoney(result.initialRiskExposure);
  document.querySelector("#initialRatio").textContent = fmtPercent(result.initialRatio);
  document.querySelector("#rentIrr").textContent = fmtPercent(result.rentIrr);
  document.querySelector("#financeIrr").textContent = fmtPercent(result.financeIrr);
  document.querySelector("#financeMonthlyRent").textContent = fmtMoney(result.financeMonthlyRent);
  document.querySelector("#financeIrrInline").textContent = fmtPercent(result.financeIrr);
  document.querySelector("#annualOrders").textContent = numberFmt.format(result.annualOrders);
  document.querySelector("#fleetScale").textContent = `${numberFmt.format(result.fleetScale)} 台`;
  document.querySelector("#vehicleTotal").textContent = fmtMoney(result.vehicleTotal);
  document.querySelector("#currentDepRate").textContent = fmtPercent(result.currentDepRate);
}

function renderResultList(result) {
  const items = [
    ["预计履行期数", `${result.runMonths} 个月`],
    ["合同期数", `${result.input.customerTerm} 个月`],
    ["车价总计", fmtMoney(result.vehicleTotal)],
    ["当前命中折旧率", fmtPercent(result.currentDepRate)],
    ["融资每期租金", fmtMoney(result.financeMonthlyRent)],
    ["融资首付", fmtMoney(result.financeDownPayment)],
    ["融资服务费", fmtMoney(result.financeFee)],
    ["估算年订单", numberFmt.format(result.annualOrders)],
    ["估算管理规模", `${numberFmt.format(result.fleetScale)} 台`]
  ];
  document.querySelector("#resultList").innerHTML = items
    .map(([label, value]) => `<article class="result-item"><span>${label}</span><strong>${value}</strong></article>`)
    .join("");
}

function renderRiskList(result) {
  const ratioState = result.initialRatio <= 0.15 ? ["warn", "低于 15%", "首期支付比例偏低，建议关注风险敞口。"] : ["ok", "高于 15%", "首期支付比例达到关注线以上。"];
  const exposureState = result.initialRiskExposure > result.vehicleTotal * 0.8 ? ["warn", "敞口较高", "初始风险敞口超过车价总计 80%。"] : ["ok", "敞口可控", "初始风险敞口处于可控区间。"];
  const runState = result.runMonths > result.input.customerTerm ? ["danger", "期数异常", "预计履行期数不能超过合同期数。"] : ["ok", "期数有效", `按 ${result.runMonths} 个月计算利润和处置收益。`];
  const items = [
    ["初始支付比例", ...ratioState],
    ["风险敞口", ...exposureState],
    ["履约假设", ...runState]
  ];
  document.querySelector("#riskList").innerHTML = items
    .map(([label, cls, value, desc]) => `<article class="risk-item ${cls}"><span>${label}</span><strong>${value}</strong><small>${desc}</small></article>`)
    .join("");
}

function renderTable(result) {
  const headers = ["期次", "日期", "收入", "支出", "净现金流", "租金", "租金调整", "剩余本金", "风险敞口", "当前残值", "运营利润", "处置收益"];
  const body = result.rows
    .filter((row) => row.period !== "")
    .map((row) => {
      const cells = [
        row.period,
        row.date,
        fmtMoney(row.revenue),
        fmtMoney(row.cost),
        fmtMoney(row.projectCashflow),
        fmtMoney(row.rent),
        fmtMoney(row.rentAdjust),
        fmtMoney(row.remainingPrincipal),
        fmtMoney(row.riskExposure),
        fmtMoney(row.residual),
        fmtMoney(row.operatingProfit),
        fmtMoney(row.disposalProfit)
      ];
      return `<tr>${cells.map((cell, index) => `<td class="${index > 1 && String(cell).includes("-") ? "negative" : ""}">${cell}</td>`).join("")}</tr>`;
    })
    .join("");
  document.querySelector("#cashflowTable").innerHTML = `<thead><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr></thead><tbody>${body}</tbody>`;
}

function renderChart(result) {
  const canvas = document.querySelector("#cashflowChart");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(320, Math.floor(rect.width * dpr));
  canvas.height = Math.floor(280 * dpr);
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, rect.width, 280);
  const rows = result.rows.filter((row) => row.period !== "" && row.period <= 36);
  const values = rows.map((row) => row.projectCashflow);
  const maxAbs = Math.max(...values.map((value) => Math.abs(value)), 1);
  const padding = { top: 24, right: 12, bottom: 36, left: 48 };
  const width = rect.width - padding.left - padding.right;
  const height = 280 - padding.top - padding.bottom;
  const zeroY = padding.top + height / 2;
  ctx.strokeStyle = "#d8e1ec";
  ctx.beginPath();
  ctx.moveTo(padding.left, zeroY);
  ctx.lineTo(padding.left + width, zeroY);
  ctx.stroke();
  const barWidth = Math.max(3, width / values.length - 2);
  values.forEach((value, index) => {
    const x = padding.left + index * (width / values.length);
    const barHeight = Math.abs(value) / maxAbs * (height / 2 - 8);
    ctx.fillStyle = value >= 0 ? "#0f9f6e" : "#cf3f2f";
    ctx.fillRect(x, value >= 0 ? zeroY - barHeight : zeroY, barWidth, barHeight);
  });
  ctx.fillStyle = "#64748b";
  ctx.font = "12px sans-serif";
  ctx.fillText(fmtMoney(maxAbs), 8, padding.top + 8);
  ctx.fillText(`-${fmtMoney(maxAbs).replace("-", "")}`, 8, padding.top + height);
  ctx.fillText("期次 0-36", padding.left, 268);
}

function renderAll() {
  const input = getInputs();
  latestResult = calculate(input);
  renderSummary(latestResult);
  renderResultList(latestResult);
  renderRiskList(latestResult);
  renderTable(latestResult);
  renderChart(latestResult);
  localStorage.setItem("subscriptionCalculatorInputs", JSON.stringify(input));
}

function setDefaults(values = DEFAULTS) {
  Object.entries(values).forEach(([key, value]) => {
    if (key === "depreciation" || key === "rentAdjustments") return;
    const field = form.elements[key];
    if (field) field.value = value;
  });
  renderRentAdjustments(values);
  depreciationGrid.innerHTML = "";
  (values.depreciation || DEFAULTS.depreciation).forEach((row) => {
    const el = document.createElement("div");
    el.className = "depreciation-row";
    el.innerHTML = `
      <label>折旧率<input data-field="rate" type="number" step="0.0001" value="${row.rate}" /></label>
      <label>车龄起（月）<input data-field="from" type="number" value="${row.from}" /></label>
      <label>车龄止（月）<input data-field="to" type="number" value="${row.to}" /></label>
    `;
    depreciationGrid.appendChild(el);
  });
}

function renderRentAdjustments(values = getInputs()) {
  const previous = {};
  rentAdjustmentGrid.querySelectorAll("[data-period]").forEach((field) => {
    previous[field.dataset.period] = asNumber(field.value);
  });
  const source = { ...(values.rentAdjustments || {}), ...previous };
  const term = Math.max(1, Math.min(60, Math.round(asNumber(values.customerTerm || DEFAULTS.customerTerm))));
  rentAdjustmentGrid.innerHTML = "";
  for (let period = 1; period <= term; period += 1) {
    const value = source[period] ?? 0;
    const el = document.createElement("div");
    el.className = `rent-adjustment-row ${asNumber(value) === 0 ? "is-zero" : "has-value"}`;
    el.innerHTML = `
      <label>第 ${period} 期<input data-period="${period}" type="number" inputmode="decimal" value="${value}" /></label>
    `;
    rentAdjustmentGrid.appendChild(el);
  }
  rentAdjustmentGrid.classList.toggle("collapsed", !showAllRentAdjustments);
  document.querySelector("#toggleRentAdjustBtn").textContent = showAllRentAdjustments ? "只看有调整" : "展开全部";
}

function syncCommission(changedName) {
  const vehiclePrice = asNumber(form.elements.vehiclePrice.value);
  const rateField = form.elements.commissionRate;
  const amountField = form.elements.salesCommission;
  if (changedName === "salesCommission") {
    lastCommissionSource = "amount";
    rateField.value = vehiclePrice === 0 ? 0 : asNumber(amountField.value) / vehiclePrice;
    return;
  }
  if (changedName === "commissionRate") {
    lastCommissionSource = "rate";
  }
  if (changedName === "vehiclePrice" && lastCommissionSource === "amount") {
    rateField.value = vehiclePrice === 0 ? 0 : asNumber(amountField.value) / vehiclePrice;
    return;
  }
  amountField.value = vehiclePrice * asNumber(rateField.value);
}

document.querySelectorAll(".tabs button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tabs button").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".tab-page").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    document.querySelector(`#${button.dataset.tab}Tab`).classList.add("active");
    if (button.dataset.tab === "result") renderChart(latestResult);
  });
});

form.addEventListener("input", (event) => {
  if (["commissionRate", "salesCommission", "vehiclePrice"].includes(event.target.name)) {
    syncCommission(event.target.name);
  }
  if (event.target.name === "customerTerm") {
    renderRentAdjustments(getInputs());
  }
  renderAll();
});

rentAdjustmentGrid.addEventListener("input", renderAll);
depreciationGrid.addEventListener("input", renderAll);
window.addEventListener("resize", () => latestResult && renderChart(latestResult));

document.querySelector("#toggleRentAdjustBtn").addEventListener("click", () => {
  showAllRentAdjustments = !showAllRentAdjustments;
  renderRentAdjustments(getInputs());
});

document.querySelector("#resetBtn").addEventListener("click", () => {
  localStorage.removeItem("subscriptionCalculatorInputs");
  showAllRentAdjustments = false;
  setDefaults();
  renderAll();
});

document.querySelector("#exportBtn").addEventListener("click", () => {
  const payload = JSON.stringify(latestResult, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `subscription-plan-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(url);
});

const saved = localStorage.getItem("subscriptionCalculatorInputs");
setDefaults(saved ? { ...DEFAULTS, ...JSON.parse(saved) } : DEFAULTS);
renderAll();
