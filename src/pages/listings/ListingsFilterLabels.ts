import { HEATING_TYPES, CONSTRUCTION_STATUSES } from "@/lib/filterConfig";
import { getTypeLabel, getSubtypeLabel } from "@/lib/propertyTypes";

const PROPERTY_TYPE_LABELS_EL: Record<string, string> = {
  apartment: "Διαμέρισμα",
  house: "Μονοκατοικία",
  villa: "Βίλα",
  land: "Οικόπεδο / Αγροτεμάχιο",
  commercial: "Επαγγελματικό ακίνητο",
  office: "Γραφείο",
  studio: "Γκαρσονιέρα",
  maisonette: "Μεζονέτα",
  warehouse: "Αποθήκη",
  hotel: "Ξενοδοχείο",
  mixed_use: "Κτίριο μεικτής χρήσης",
  parking: "Θέση στάθμευσης",
  storage: "Αποθηκευτικός χώρος",
};

const SUBTYPE_LABELS_EL: Record<string, string> = {
  studio: "Γκαρσονιέρα",
  "1bedroom": "1 υπνοδωμάτιο",
  "2bedroom": "2 υπνοδωμάτια",
  "3bedroom": "3 υπνοδωμάτια",
  "4bedroom": "4+ υπνοδωμάτια",
  ground_floor: "Ισόγειο",
  basement: "Υπόγειο",
  detached: "Μονοκατοικία",
  semi_detached: "Ημιανεξάρτητη κατοικία",
  terraced: "Μεζονέτα σε σειρά",
  townhouse: "Αστική κατοικία",
  bungalow: "Ισόγεια κατοικία",
  buildable: "Οικοδομήσιμο οικόπεδο",
  agricultural: "Αγροτεμάχιο",
  coastal: "Παραθαλάσσιο",
  forest: "Δασική έκταση",
  industrial: "Βιομηχανική ζώνη",
  tourism: "Τουριστική ζώνη",
  shop: "Κατάστημα",
  warehouse: "Αποθήκη",
  craft_workshop: "Βιοτεχνικός χώρος",
  hotel: "Ξενοδοχείο",
  commercial_building: "Κτίριο επαγγελματικών χώρων",
  hall: "Αίθουσα",
  showroom: "Εκθεσιακός χώρος",
  restaurant: "Εστιατόριο / καφέ",
  clinic: "Ιατρείο",
  mixed_use: "Κτίριο μεικτής χρήσης",
  office_private: "Ιδιωτικό γραφείο",
  office_open_plan: "Γραφείο ανοικτού χώρου",
  office_coworking: "Coworking / ευέλικτος χώρος",
  office_business: "Business centre",
  office_floor: "Ολόκληρος όροφος",
  other_commercial: "Λοιπός επαγγελματικός χώρος",
  private_office: "Ιδιωτικό γραφείο",
  open_plan: "Γραφείο ανοικτού χώρου",
  coworking: "Coworking / ευέλικτος χώρος",
  business_centre: "Business centre",
  floor: "Ολόκληρος όροφος",
  converted: "Μετατρεπόμενος χώρος",
};

const HEATING_LABELS_EL: Record<string, string> = {
  autonomous_oil: "Αυτόνομη θέρμανση (πετρέλαιο)",
  autonomous_gas: "Αυτόνομη θέρμανση (φυσικό αέριο)",
  autonomous: "Αυτόνομη θέρμανση",
  central_oil: "Κεντρική θέρμανση (πετρέλαιο)",
  central_gas: "Κεντρική θέρμανση (φυσικό αέριο)",
  central: "Κεντρική θέρμανση",
  floor: "Ενδοδαπέδια θέρμανση",
  none: "Χωρίς θέρμανση",
  other: "Άλλη θέρμανση",
};

const CONDITION_LABELS_EL: Record<string, string> = {
  new: "Νεόδμητο",
  under_construction: "Υπό κατασκευή",
  renovated: "Ανακαινισμένο",
  needs_renovation: "Χρήζει ανακαίνισης",
  unfinished: "Ημιτελές",
  preserved: "Διατηρητέο",
  neoclassical: "Νεοκλασικό",
};

export const translatePropertyType = (type: string, isGreek: boolean) =>
  isGreek ? (PROPERTY_TYPE_LABELS_EL[type] ?? getTypeLabel(type)) : getTypeLabel(type);

export const translateSubtype = (type: string, subtype: string, isGreek: boolean) =>
  isGreek ? (SUBTYPE_LABELS_EL[subtype] ?? getSubtypeLabel(type, subtype)) : getSubtypeLabel(type, subtype);

export const translateHeating = (value: string, isGreek: boolean) => {
  const english = HEATING_TYPES.find((heating) => heating.value === value)?.label ?? value;
  return isGreek ? (HEATING_LABELS_EL[value] ?? english) : english;
};

export const translateCondition = (value: string, isGreek: boolean) => {
  const english = CONSTRUCTION_STATUSES.find((status) => status.value === value)?.label ?? value;
  return isGreek ? (CONDITION_LABELS_EL[value] ?? english) : english;
};
