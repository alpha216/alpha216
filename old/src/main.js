// Decorative sample cells; actual occupancy data lives in the linked dashboard.
const heatmap = document.getElementById('heatmap');
if (heatmap) {
  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column < 16; column += 1) {
      const cell = document.createElement('i');
      const peak = Math.max(0, Math.sin((column / 15) * Math.PI));
      cell.style.opacity = String(0.12 + peak * (0.35 + ((row * 7 + column * 3) % 9) / 18));
      heatmap.appendChild(cell);
    }
  }
}
document.getElementById('year').textContent = new Date().getFullYear();
