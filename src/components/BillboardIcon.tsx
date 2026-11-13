import {
  BookOpen, BriefcaseBusiness, Coffee, ConciergeBell, Monitor,
  Presentation, Trophy, Utensils, type LucideIcon,
} from "lucide-react";
import { getBillboardBuildingKey } from "@/data/billboardGroups";

const icons: Record<string, LucideIcon> = {
  iipc: BriefcaseBusiness,
  "front office": ConciergeBell,
  "mac lab": Monitor,
  "indoor auditorium": Presentation,
  "indoor sports": Trophy,
  cafeteria: Coffee,
  "cafeteria 2": Utensils,
  library: BookOpen,
};

export default function BillboardIcon({ buildingName, className }: {
  buildingName: string;
  className?: string;
}) {
  const Icon = icons[getBillboardBuildingKey(buildingName)] ?? BookOpen;
  return <Icon className={className} size={24} strokeWidth={1.8} aria-hidden="true" />;
}
