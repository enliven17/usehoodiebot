import type { ReactNode } from "react";

import { Footer, Nav } from "@/components/landing/Sections";

import s from "./doc.module.css";

export function Doc({ title, updated, figure, children }: { title: string; updated: string; figure?: ReactNode; children: ReactNode }) {
  return (
    <>
      <Nav />
      <main className={s.wrap}>
        {figure ? <div className={s.figure}>{figure}</div> : null}
        <h1 className={s.title}>{title}</h1>
        <p className={s.updated}>Updated {updated}</p>
        <article className={s.body}>{children}</article>
      </main>
      <Footer />
    </>
  );
}
