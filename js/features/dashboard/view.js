// js/features/dashboard/view.js — KPIs e gráficos (Chart.js) do dashboard.

import { appState, monthlyChart, statusDoughnutChart, setMonthlyChart, setStatusDoughnutChart } from '../../core/state.js';
import { getFilteredEvents } from '../../ui/nav.js';
import { formatCurrency } from '../../utils/format.js';

export function updateDashboard() {
  const events = getFilteredEvents();
  const totalRevenue = events.reduce((sum, e) => sum + e.amount, 0);
  const totalShows = events.length;
  const activeNegotiations = events.filter(e => e.status === "durante").length;

  // Format faturamento
  const formattedRevenue = formatCurrency(totalRevenue);

  // Update header and card total faturamento
  if (document.getElementById("header-total-revenue")) document.getElementById("header-total-revenue").textContent = formattedRevenue;
  if (document.getElementById("kpi-total-revenue")) document.getElementById("kpi-total-revenue").textContent = formattedRevenue;
  if (document.getElementById("kpi-total-shows")) document.getElementById("kpi-total-shows").textContent = totalShows;
  if (document.getElementById("kpi-active-negotiations")) document.getElementById("kpi-active-negotiations").textContent = activeNegotiations;

  // Goal Tracking
  const currentName = appState.currentRole ? appState.currentRole.split(" (")[0] : "Admin";
  let goalValue = appState.goals[currentName] || 500000; // Default to 500k if not set

  document.getElementById("kpi-goal-value").textContent = formatCurrency(goalValue);

  const percent = goalValue > 0 ? Math.min(100, Math.round((totalRevenue / goalValue) * 100)) : 0;
  document.getElementById("kpi-goal-percent").textContent = `${percent}%`;
  document.getElementById("dashboard-progress-fill").style.width = `${percent}%`;

  // Render/Update charts
  renderDashboardCharts(events);
}

export function renderDashboardCharts(events) {
  // Chart Colors (Yellow theme)
  const yellowColor = '#ffcc00';
  const yellowHover = '#ffd633';
  const grayColor = '#1c1c22';
  const gridColor = 'rgba(255, 255, 255, 0.05)';
  const textColor = '#9a9a9f';

  // 1. Monthly Revenue Chart (Bar Chart)
  // Initialize monthly revenue object for 2026
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const monthlyRevenue = Array(12).fill(0);

  events.forEach(e => {
    const d = new Date(e.date);
    if (!isNaN(d.getTime())) {
      const mIndex = d.getMonth();
      monthlyRevenue[mIndex] += e.amount;
    }
  });

  const ctxMonthly = document.getElementById("monthlyRevenueChart").getContext("2d");
  if (monthlyChart) {
    monthlyChart.destroy();
  }

  setMonthlyChart(new window.Chart(ctxMonthly, {
    type: 'bar',
    data: {
      labels: months,
      datasets: [{
        label: 'Faturamento',
        data: monthlyRevenue,
        backgroundColor: 'rgba(255, 204, 0, 0.85)',
        borderColor: yellowColor,
        borderWidth: 1,
        borderRadius: 4,
        hoverBackgroundColor: yellowHover
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function (context) {
              return ' ' + formatCurrency(context.parsed.y);
            }
          }
        }
      },
      scales: {
        y: {
          grid: { color: gridColor },
          ticks: {
            color: textColor,
            font: { family: 'Inter' },
            callback: function (value) {
              if (value >= 1000) {
                return 'R$ ' + (value / 1000) + 'k';
              }
              return 'R$ ' + value;
            }
          }
        },
        x: {
          grid: { display: false },
          ticks: { color: textColor, font: { family: 'Inter' } }
        }
      }
    }
  }));

  // 2. Status Doughnut Chart
  const statusCounts = { antes: 0, durante: 0, apos: 0 };
  events.forEach(e => {
    if (statusCounts[e.status] !== undefined) {
      statusCounts[e.status]++;
    }
  });

  const ctxStatus = document.getElementById("statusChart").getContext("2d");
  if (statusDoughnutChart) {
    statusDoughnutChart.destroy();
  }

  setStatusDoughnutChart(new window.Chart(ctxStatus, {
    type: 'doughnut',
    data: {
      labels: ['Antes (Negociação)', 'Durante (Confirmado)', 'Após (Concluído)'],
      datasets: [{
        data: [statusCounts.antes, statusCounts.durante, statusCounts.apos],
        backgroundColor: [
          'rgba(255, 69, 58, 0.8)',
          'rgba(255, 204, 0, 0.8)',
          'rgba(48, 209, 88, 0.8)'
        ],
        borderColor: '#121216',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: textColor,
            font: { family: 'Inter', size: 11 },
            padding: 15
          }
        }
      },
      cutout: '65%'
    }
  }));
}
