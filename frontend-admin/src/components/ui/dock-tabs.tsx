"use client";

import * as React from "react";
import {
  motion,
  MotionValue,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";
import { cn } from "../../lib/utils";

export type DockTabItem = {
  id: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
};

type DockTabsProps = {
  items: DockTabItem[];
  activeId?: string;
  onChange?: (id: string) => void;
  className?: string;
  floating?: boolean;
};

const DISTANCE = 132;
const BASE_SIZE = 44;
const MAGNIFIED_SIZE = 62;

export default function DockTabs({ items, activeId, onChange, className, floating = true }: DockTabsProps) {
  const mouseX = useMotionValue(Number.POSITIVE_INFINITY);

  return (
    <div
      className={cn(
        floating && "fixed bottom-[max(14px,env(safe-area-inset-bottom))] left-1/2 z-[120] -translate-x-1/2",
        "max-w-[calc(100vw-20px)]",
        className,
      )}
    >
      <motion.div
        onMouseMove={(event) => mouseX.set(event.clientX)}
        onMouseLeave={() => mouseX.set(Number.POSITIVE_INFINITY)}
        className="nst-dock-shell flex items-end gap-1.5 overflow-x-auto rounded-[22px] border border-[var(--nst-ui-border)] bg-[var(--nst-ui-glass)] px-2 py-2 shadow-[var(--nst-ui-shadow-lg)] backdrop-blur-2xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item) => (
          <DockItem
            key={item.id}
            item={item}
            mouseX={mouseX}
            active={activeId === item.id}
            onClick={() => onChange?.(item.id)}
          />
        ))}
      </motion.div>
    </div>
  );
}

function DockItem({
  item,
  mouseX,
  active,
  onClick,
}: {
  item: DockTabItem;
  mouseX: MotionValue<number>;
  active: boolean;
  onClick: () => void;
}) {
  const ref = React.useRef<HTMLButtonElement>(null);
  const distance = useTransform(mouseX, (mouseValue) => {
    const bounds = ref.current?.getBoundingClientRect();
    if (!bounds) return Number.POSITIVE_INFINITY;
    return mouseValue - (bounds.left + bounds.width / 2);
  });
  const sizeTarget = useTransform(distance, [-DISTANCE, 0, DISTANCE], [BASE_SIZE, MAGNIFIED_SIZE, BASE_SIZE]);
  const size = useSpring(sizeTarget, { mass: 0.14, stiffness: 310, damping: 23 });
  const iconTarget = useTransform(distance, [-DISTANCE, 0, DISTANCE], [1, 1.13, 1]);
  const iconScale = useSpring(iconTarget, { mass: 0.12, stiffness: 320, damping: 23 });

  return (
    <motion.button
      ref={ref}
      type="button"
      style={{ width: size, height: size }}
      onClick={onClick}
      aria-label={item.label}
      title={item.label}
      className={cn(
        "group relative flex shrink-0 items-center justify-center rounded-[15px] border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--nst-ui-primary)]/55",
        active
          ? "border-[var(--nst-ui-border-strong)] bg-[var(--nst-ui-primary-soft)] text-[var(--nst-ui-primary)]"
          : "border-transparent bg-transparent text-[var(--nst-ui-muted)] hover:bg-[var(--nst-ui-surface-soft)] hover:text-[var(--nst-ui-text)]",
      )}
    >
      <motion.span style={{ scale: iconScale }} className="flex items-center justify-center [&_svg]:h-[21px] [&_svg]:w-[21px] [&_svg]:stroke-[1.8]">
        {item.icon}
      </motion.span>
      {!!item.badge && item.badge > 0 && (
        <span className="absolute right-0.5 top-0.5 grid min-h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-black leading-none text-white">
          {item.badge > 99 ? "99+" : item.badge}
        </span>
      )}
      <span className="pointer-events-none absolute -top-9 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-[var(--nst-ui-border)] bg-[var(--nst-ui-tooltip)] px-2 py-1 text-[11px] font-semibold text-white shadow-lg md:group-hover:block">
        {item.label}
      </span>
      <motion.span
        animate={{ opacity: active ? 1 : 0, scaleX: active ? 1 : 0.45 }}
        className="absolute -bottom-1 h-[3px] w-4 rounded-full bg-[var(--nst-ui-primary)]"
      />
    </motion.button>
  );
}
