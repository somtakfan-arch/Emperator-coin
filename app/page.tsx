import Header from "@/components/landing/Header";
import Hero from "@/components/landing/Hero";
import Features from "@/components/landing/Features";
import LiveDemo from "@/components/landing/LiveDemo";
import GrowthEngine from "@/components/landing/GrowthEngine";
import InstallCta from "@/components/landing/InstallCta";
import Footer from "@/components/landing/Footer";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <Header />
      <main className="flex-1">
        <Hero />
        <Features />
        <LiveDemo />
        <GrowthEngine />
        <InstallCta />
      </main>
      <Footer />
    </div>
  );
}
