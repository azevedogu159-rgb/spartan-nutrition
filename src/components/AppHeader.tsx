import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, PackagePlus, History, Boxes, ShoppingCart, Users, FlaskConical, Wallet, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth";
import spartanLogo from "@/assets/spartan-logo.jpg";

const tabs = [
  { to: "/", label: "Painel", icon: LayoutDashboard },
  { to: "/compras", label: "Compras", icon: PackagePlus },
  { to: "/historico-compras", label: "Histórico", icon: History },
  { to: "/estoque", label: "Estoque", icon: Boxes },
  { to: "/vendas", label: "Vendas", icon: ShoppingCart },
  { to: "/contas-a-receber", label: "A receber", icon: Wallet },
  { to: "/clientes", label: "Clientes", icon: Users },
  { to: "/testes", label: "Amostras", icon: FlaskConical },
] as const;

export function AppHeader() {
  const { pathname } = useLocation();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const handleLogout = async () => {
    await signOut();
    navigate({ to: "/login" });
  };
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-[image:var(--gradient-luxe)] text-primary-foreground shadow-elegant">
      <div className="mx-auto max-w-5xl px-4 pt-4 pb-2">
        <div className="flex items-center gap-3">
          <img
            src={spartanLogo}
            alt="Logo Spartan Nutrition"
            className="h-12 w-12 rounded-full object-cover ring-2 ring-accent/60 shadow-soft"
          />
          <div className="flex-1">
            <h1 className="text-xl font-semibold tracking-wide">
              <span className="bg-[image:var(--gradient-gold)] bg-clip-text text-transparent">Spartan</span>{" "}
              Nutrition
            </h1>
            <p className="text-xs opacity-80">Gestão de estoque, vendas e lucro</p>
          </div>
          <button
            onClick={handleLogout}
            aria-label="Sair"
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-primary-foreground/90 hover:bg-white/10 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
        <nav className="mt-3 -mx-1 flex gap-1 overflow-x-auto">
          {tabs.map((t) => {
            const active = pathname === t.to;
            const Icon = t.icon;
            return (
              <Link
                key={t.to}
                to={t.to}
                className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-accent text-accent-foreground shadow-soft"
                    : "text-primary-foreground/80 hover:bg-white/10"
                }`}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
