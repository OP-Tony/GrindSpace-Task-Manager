// ==========================================================================
// GrindSpace Analytics Chart Controller (ES Module)
// ==========================================================================

let analyticsChart = null;

export function renderAnalyticsChart(logs) {
  const canvas = document.getElementById('analytics-chart');
  if (!canvas) return;
  
  const daysData = {};
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const today = new Date();

  // Initialize the last 7 calendar days with 0 minutes
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const label = i === 0 ? 'Today' : dayNames[d.getDay()];
    daysData[dateStr] = { label: label, minutes: 0 };
  }

  // Group SQLite stats focus duration per day
  logs.forEach(session => {
    if (session.type === 'work' && session.timestamp) {
      const dateStr = session.timestamp.split(' ')[0]; // SQLite datetime string format
      if (daysData[dateStr]) {
        daysData[dateStr].minutes += session.duration;
      }
    }
  });

  const labels = Object.values(daysData).map(d => d.label);
  const dataValues = Object.values(daysData).map(d => d.minutes);

  const theme = document.documentElement.getAttribute('data-theme') || 'dark';
  const isDark = theme === 'dark';
  const primaryColor = isDark ? '#A8C7FA' : '#0057CF';
  const textColor = isDark ? '#C4C6D0' : '#43474E';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)';

  if (analyticsChart) {
    analyticsChart.destroy();
  }

  // Verify Chart.js is fully loaded in page lifecycle
  if (typeof Chart === 'undefined') {
    console.warn('Chart.js CDN is still loading...');
    return;
  }

  const ctx = canvas.getContext('2d');
  analyticsChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Focus Minutes',
        data: dataValues,
        backgroundColor: primaryColor,
        borderRadius: 5,
        borderSkipped: false,
        barPercentage: 0.6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: isDark ? 'rgba(24, 25, 30, 0.95)' : 'rgba(255, 255, 255, 0.95)',
          titleColor: isDark ? '#E2E2E6' : '#1A1C1E',
          bodyColor: isDark ? '#C4C6D0' : '#43474E',
          borderColor: primaryColor,
          borderWidth: 1,
          displayColors: false,
          callbacks: {
            label: (context) => ` ${context.parsed.y} mins`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: textColor, font: { family: 'Google Sans', size: 9 } }
        },
        y: {
          border: { dash: [4, 4] },
          grid: { color: gridColor },
          ticks: { 
            color: textColor, 
            font: { family: 'Google Sans', size: 9 },
            stepSize: 15,
            precision: 0
          }
        }
      }
    }
  });
}
