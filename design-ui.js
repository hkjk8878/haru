/* Align small Figma vectors to device pixels without scaling the assets. */
(() => {
  let frame;
  function alignIcons() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const ratio = window.devicePixelRatio || 1;
      const icons = [...document.querySelectorAll('.todo-card .mvs img')];
      for (const icon of icons) icon.style.translate = 'none';
      const offsets = icons.map(icon => {
        const rect = icon.getBoundingClientRect();
        return [(Math.round(rect.left * ratio) / ratio) - rect.left,
          (Math.round(rect.top * ratio) / ratio) - rect.top];
      });
      icons.forEach((icon, index) => {
        icon.style.translate = `${offsets[index][0]}px ${offsets[index][1]}px`;
      });
    });
  }
  const originalRender = render;
  render = function(...args) {
    const result = originalRender.apply(this, args);
    alignIcons();
    return result;
  };
  window.addEventListener('resize', alignIcons, {passive:true});
  document.fonts?.ready.then(alignIcons);
})();
