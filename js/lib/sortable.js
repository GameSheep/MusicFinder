/**
 * MusicFinder — Lightweight Drag-to-Reorder
 * Minimal replacement for Sortable.js, ~50 lines.
 */

function makeSortable(container, onReorder) {
  let dragEl = null;
  let startIdx = -1;

  container.addEventListener('dragstart', e => {
    dragEl = e.target.closest('li[draggable]');
    if (!dragEl) return;
    startIdx = Array.from(container.children).indexOf(dragEl);
    dragEl.style.opacity = '0.4';
    e.dataTransfer.effectAllowed = 'move';
  });

  container.addEventListener('dragend', e => {
    if (!dragEl) return;
    dragEl.style.opacity = '1';
    const endIdx = Array.from(container.children).indexOf(dragEl);
    if (startIdx !== -1 && endIdx !== -1 && startIdx !== endIdx) {
      onReorder(startIdx, endIdx);
    }
    dragEl = null;
    startIdx = -1;
  });

  container.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const target = e.target.closest('li[draggable]');
    if (!target || target === dragEl) return;
    const children = Array.from(container.children);
    const targetIdx = children.indexOf(target);
    const dragIdx = children.indexOf(dragEl);
    if (targetIdx > dragIdx) {
      container.insertBefore(dragEl, target.nextSibling);
    } else {
      container.insertBefore(dragEl, target);
    }
  });
}
