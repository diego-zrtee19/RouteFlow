import { Navbar, Footer } from "@/components/shared/Navigation";
import { LandingHero } from "@/components/landing/LandingHero";
import { LandingSections } from "@/components/landing/LandingSections";

export default function Home() {
  return (
    <main className="min-h-screen bg-brand-bg">
      <Navbar />
      <LandingHero />
      <LandingSections />
      <Footer />
    </main>
  );
}
