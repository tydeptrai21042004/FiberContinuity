import { useRef, useState, type ChangeEvent, type DragEvent } from "react";

export default function ArchivePicker({ disabled, onFile }: { disabled?: boolean; onFile: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) onFile(file);
    event.target.value = "";
  }

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    const file = event.dataTransfer.files?.[0];
    if (file) onFile(file);
  }

  return (
    <div
      className={`archive-picker ${dragging ? "dragging" : ""}`}
      onDragOver={(event) => { event.preventDefault(); if (!disabled) setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={drop}
    >
      <input
        ref={inputRef}
        className="visually-hidden"
        type="file"
        accept="application/json,.json,.fcr.json"
        onChange={choose}
        disabled={disabled}
      />
      <span className="archive-picker-icon" aria-hidden="true">⇧</span>
      <strong>Drop a recovery archive here</strong>
      <p>FiberContinuity <code>.fcr.json</code> archive. Validation happens locally in this browser.</p>
      <button type="button" disabled={disabled} onClick={() => inputRef.current?.click()}>Choose archive</button>
    </div>
  );
}
