"use client";

import type React from "react";
import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { createSwapy, type SlotItemMapArray } from "swapy";
import { GripVertical } from "lucide-react";
import { cn } from "../../lib/utils";

type AnimationType = "dynamic" | "spring" | "none";
type SwapMode = "hover" | "drop";

type Config = {
  animation: AnimationType;
  continuousMode: boolean;
  manualSwap: boolean;
  swapMode: SwapMode;
  autoScrollOnDrag: boolean;
};

type SwapEvent = { newSlotItemMap: { asArray: SlotItemMapArray } };
type SwapEndEvent = { slotItemMap: { asArray: SlotItemMapArray }; hasChanged: boolean };

type SwapyLayoutProps = {
  id: string;
  enable?: boolean;
  onSwap?: (event: SwapEvent) => void;
  onSwapEnd?: (event: SwapEndEvent) => void;
  config?: Partial<Config>;
  updateKey?: string | number;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
};

export function SwapyLayout({ id, enable = true, onSwap, onSwapEnd, config = {}, updateKey, className, style, children }: SwapyLayoutProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const swapyRef = useRef<ReturnType<typeof createSwapy> | null>(null);
  const onSwapRef = useRef(onSwap);
  const onSwapEndRef = useRef(onSwapEnd);
  onSwapRef.current = onSwap;
  onSwapEndRef.current = onSwapEnd;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enable) return;
    const instance = createSwapy(container, {
      animation: "spring",
      swapMode: "hover",
      autoScrollOnDrag: true,
      ...config,
    });
    swapyRef.current = instance;
    instance.onSwap((event) => onSwapRef.current?.(event));
    instance.onSwapEnd((event) => onSwapEndRef.current?.(event));
    return () => {
      instance.destroy();
      swapyRef.current = null;
    };
  }, [enable, config.animation, config.swapMode, config.autoScrollOnDrag, config.continuousMode, config.manualSwap]);

  useEffect(() => {
    if (!enable || !swapyRef.current) return;
    const frame = requestAnimationFrame(() => swapyRef.current?.update());
    return () => cancelAnimationFrame(frame);
  }, [enable, updateKey]);

  return <div id={id} ref={containerRef} className={className} style={style}>{children}</div>;
}

export function DragHandle({ className }: { className?: string }) {
  return (
    <button
      type="button"
      data-swapy-handle
      aria-label="Drag widget"
      className={cn("nst-drag-handle inline-grid h-8 w-8 cursor-grab place-items-center rounded-lg border border-[var(--nst-ui-border)] bg-[var(--nst-ui-surface-soft)] text-[var(--nst-ui-muted)] active:cursor-grabbing", className)}
    >
      <GripVertical size={17} strokeWidth={1.8} />
    </button>
  );
}

export function SwapySlot({ id, className, style, children }: { id: string; className?: string; style?: React.CSSProperties; children: React.ReactNode }) {
  return (
    <motion.div
      layout="position"
      transition={{ type: "spring", stiffness: 420, damping: 36, mass: 0.55 }}
      className={cn("min-h-0 transition-colors data-[swapy-highlighted]:bg-[var(--nst-ui-primary-soft)]", className)}
      style={style}
      data-swapy-slot={id}
    >
      {children}
    </motion.div>
  );
}

const dragOpacityClassMap: Record<number, string> = {
  10: "data-[swapy-dragging]:opacity-10", 20: "data-[swapy-dragging]:opacity-20",
  30: "data-[swapy-dragging]:opacity-30", 40: "data-[swapy-dragging]:opacity-40",
  50: "data-[swapy-dragging]:opacity-50", 60: "data-[swapy-dragging]:opacity-60",
  70: "data-[swapy-dragging]:opacity-70", 80: "data-[swapy-dragging]:opacity-80",
  90: "data-[swapy-dragging]:opacity-90", 100: "data-[swapy-dragging]:opacity-100",
};

export function SwapyItem({ id, className, children, dragItemOpacity = 92 }: { id: string; className?: string; children: React.ReactNode; dragItemOpacity?: number }) {
  const opacityClass = dragOpacityClassMap[dragItemOpacity] ?? "data-[swapy-dragging]:opacity-90";
  return <div className={cn("h-full min-h-0", opacityClass, className)} data-swapy-item={id}>{children}</div>;
}
