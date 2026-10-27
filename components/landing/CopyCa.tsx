"use client";

import { useState } from "react";

import s from "./landing.module.css";

export function CopyCa({ ca }: { ca: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={`${s.ca} glass`}>
      <strong>$HOODIE</strong>
      <code title={ca}>{ca}</code>
      <button
        type="button"
        className="btn"
        onClick={async () => {
          await navigator.clipboard.writeText(ca).catch(() => {});
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        }}
      >
        {copied ? "Copied" : "Copy CA"}
      </button>
    </div>
  );
}
