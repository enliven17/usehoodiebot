"use client";

// From the portfolio registry (registry/components/shimmering-text), Tailwind classes swapped for Kurage tokens.
import { motion, type Variants } from "motion/react";
import { useCallback, type ComponentProps } from "react";

type Props = Omit<ComponentProps<typeof motion.span>, "children"> & { text: string; duration?: number; isStopped?: boolean };

export function ShimmeringText({ text, duration = 1, isStopped = false, style, ...props }: Props) {
  const variants = useCallback(
    (i: number): Variants => ({
      running: {
        color: ["var(--color)", "var(--shimmering-color)", "var(--color)"],
        transition: { duration, repeat: Infinity, repeatType: "loop", repeatDelay: text.length * 0.05, delay: (i * duration) / text.length, ease: "easeInOut" },
      },
      stopped: { color: "var(--color)", transition: { duration: duration * 0.5, ease: "easeOut" } },
    }),
    [duration, text.length],
  );
  return (
    <motion.span style={{ display: "inline-block", userSelect: "none", ["--color" as string]: "var(--text-faint)", ["--shimmering-color" as string]: "var(--cyan-200)", ...style }} {...props}>
      {text.split("").map((char, i) => (
        <motion.span key={i} style={{ display: "inline-block", whiteSpace: "pre" }} initial="stopped" animate={isStopped ? "stopped" : "running"} variants={variants(i)} aria-hidden>
          {char}
        </motion.span>
      ))}
      <span className="sr-only">{text}</span>
    </motion.span>
  );
}
