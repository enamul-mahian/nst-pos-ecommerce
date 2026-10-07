"use client";

import { Boxes, Gauge, PackageCheck, Settings2, ShoppingBag } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import DockTabs from "../ui/dock-tabs";

const items = [
  { id: "/dashboard", label: "Dashboard", icon: <Gauge /> },
  { id: "/products", label: "Products", icon: <Boxes /> },
  { id: "/device-stock", label: "Device Stock", icon: <PackageCheck /> },
  { id: "/sales", label: "Sales", icon: <ShoppingBag /> },
  { id: "/settings", label: "Settings", icon: <Settings2 /> },
];

export default function NstDashboardDock() {
  const navigate = useNavigate();
  const location = useLocation();
  const active = items.find((item) => location.pathname === item.id || location.pathname.startsWith(`${item.id}/`))?.id || "/dashboard";

  return <DockTabs items={items} activeId={active} onChange={navigate} />;
}
