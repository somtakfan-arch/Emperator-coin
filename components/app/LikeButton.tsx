"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Heart } from "lucide-react";

const PARTICLE_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

export default function LikeButton({
  liked,
  onToggle,
  size = 20,
}: {
  liked: boolean;
  onToggle: () => void;
  size?: number;
}) {
  const [burstKey, setBurstKey] = useState(0);

  function handleClick() {
    onToggle();
    if (!liked) setBurstKey((k) => k + 1);
  }

  return (
    <button
      type="button"
      aria-label={liked ? "Убрать из избранного" : "Добавить в избранное"}
      onClick={handleClick}
      className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full active:scale-90 transition-transform"
    >
      <motion.span
        key={liked ? "liked" : "idle"}
        initial={{ scale: 0.6 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 15 }}
      >
        <Heart
          size={size}
          fill={liked ? "var(--accent-2)" : "none"}
          stroke={liked ? "var(--accent-2)" : "var(--muted)"}
          strokeWidth={2}
        />
      </motion.span>

      <AnimatePresence>
        {burstKey > 0 && (
          <motion.span
            key={burstKey}
            className="pointer-events-none absolute inset-0"
            initial="hidden"
            animate="visible"
            exit="hidden"
            onAnimationComplete={() => {}}
          >
            {PARTICLE_ANGLES.map((angle) => {
              const rad = (angle * Math.PI) / 180;
              const dx = Math.cos(rad) * 22;
              const dy = Math.sin(rad) * 22;
              return (
                <motion.span
                  key={angle}
                  className="absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full"
                  style={{ background: "var(--accent-2)" }}
                  initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                  animate={{ x: dx, y: dy, opacity: 0, scale: 0.3 }}
                  transition={{ duration: 0.55, ease: "easeOut" }}
                />
              );
            })}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}
