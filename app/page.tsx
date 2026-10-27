import { Field } from "@/components/Field";
import { CopyCa } from "@/components/landing/CopyCa";
import { Headline } from "@/components/landing/Headline";
import { HeroComposer } from "@/components/landing/HeroComposer";
import s from "@/components/landing/landing.module.css";
import { Closing, Footer, Nav, Product, Strategies, Team, Venues, Wallet } from "@/components/landing/Sections";

export default function Home() {
  const ca = process.env.NEXT_PUBLIC_HOODIE_CA?.trim();
  return (
    <>
      <Field targetId="composer" />
      <div className={s.page}>
        <Nav />
        <main>
          <section className={s.hero}>
            <div className={s.core}>
              <div className={s.halo} />
              <Headline className={s.h1} />
              <p className={s.lede}>
                Tell HOODIEBOT what to watch. Its specialists research Pons launches, wait for your entry and trade inside your rules.
              </p>
              <HeroComposer />
              {ca ? <CopyCa ca={ca} /> : null}
            </div>
          </section>
          <Product />
          <Strategies />
          <Team />
          <Wallet />
          <Venues />
          <Closing />
        </main>
        <Footer />
      </div>
    </>
  );
}
