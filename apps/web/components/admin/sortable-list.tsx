"use client";

import { DragEvent, KeyboardEvent, ReactNode, useState } from "react";
import { AdminIcon } from "./admin-icon";
import styles from "./sortable-list.module.css";

type ItemProps = {
  onDragEnter: (event: DragEvent<HTMLElement>) => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
};

type HandleProps = {
  draggable: boolean;
  disabled: boolean;
  onDragStart: (event: DragEvent<HTMLButtonElement>) => void;
  onDragEnd: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
};

type RenderBindings = {
  itemProps: ItemProps;
  handleProps: HandleProps;
  stateClassName: string;
};

type SortableListProps<T> = {
  items: T[];
  getId: (item: T) => string;
  getLabel: (item: T) => string;
  onReorder: (items: T[]) => void | Promise<void>;
  renderItem: (item: T, index: number, bindings: RenderBindings) => ReactNode;
  disabled?: boolean;
};

function moveItem<T>(items: T[], from: number, to: number) {
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function SortableList<T>({ items, getId, getLabel, onReorder, renderItem, disabled = false }: SortableListProps<T>) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const interactionDisabled = disabled || items.length < 2;

  function reset() {
    setDraggedId(null);
    setOverId(null);
  }

  function reorder(fromId: string, toIndex: number) {
    const fromIndex = items.findIndex(item => getId(item) === fromId);
    if (fromIndex < 0 || toIndex < 0 || toIndex >= items.length || fromIndex === toIndex) return;
    const item = items[fromIndex];
    const next = moveItem(items, fromIndex, toIndex);
    setAnnouncement(`${getLabel(item)} movido para a posição ${toIndex + 1}.`);
    void onReorder(next);
  }

  return <>
    {items.map((item, index) => {
      const itemId = getId(item);
      const stateClassName = [draggedId === itemId ? styles.dragging : "", overId === itemId && draggedId !== itemId ? styles.target : ""].filter(Boolean).join(" ");
      const itemProps: ItemProps = {
        onDragEnter: event => {
          if (!draggedId || draggedId === itemId) return;
          event.preventDefault();
          setOverId(itemId);
        },
        onDragOver: event => {
          if (!draggedId || draggedId === itemId) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        },
        onDrop: event => {
          event.preventDefault();
          if (draggedId) reorder(draggedId, index);
          reset();
        },
      };
      const handleProps: HandleProps = {
        draggable: !interactionDisabled,
        disabled: interactionDisabled,
        onDragStart: event => {
          if (interactionDisabled) return;
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", itemId);
          setDraggedId(itemId);
        },
        onDragEnd: reset,
        onKeyDown: event => {
          if (interactionDisabled) return;
          const target = event.key === "ArrowUp" ? index - 1
            : event.key === "ArrowDown" ? index + 1
              : event.key === "Home" ? 0
                : event.key === "End" ? items.length - 1
                  : -1;
          if (target < 0 || target >= items.length || target === index) return;
          event.preventDefault();
          reorder(itemId, target);
        },
      };
      return renderItem(item, index, { itemProps, handleProps, stateClassName });
    })}
    <span className={styles.srOnly} aria-live="polite">{announcement}</span>
  </>;
}

export function SortableHandle({ label, ...props }: HandleProps & { label: string }) {
  return <button
    {...props}
    type="button"
    className={styles.handle}
    aria-label={`Reordenar ${label}`}
    title="Arraste para reordenar. Pelo teclado, use as setas."
  ><AdminIcon name="grip" size={18}/></button>;
}
