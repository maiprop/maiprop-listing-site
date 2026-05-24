import { SectionTitle, ToggleChip } from "@/components/listings/FormPrimitives";
import { useTranslation } from "react-i18next";
import type { ListingFormData } from "@/hooks/useListingForm";
import { tFallback } from "@/lib/i18nFallback";

interface Props {
  form: ListingFormData;
  toggle: (key: string) => void;
}

const isLand = (t: string) => t === "land";
const isCommercial = (t: string) => ["commercial", "office"].includes(t);

export function StepFeatures({ form, toggle }: Props) {
  const { t } = useTranslation();
  const pt = form.property_type;
  const tr = (key: string, fallback: string) => tFallback(t, key, fallback);

  return (
    <div>
      <h2 className="font-display text-xl font-semibold mb-4">{tr("createListing.features.heading", "Features & Amenities")}</h2>

      {!isLand(pt) && (
        <>
          <SectionTitle>{tr("createListing.features.internal", "Internal")}</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {[
              { k: "has_elevator", l: tr("createListing.features.items.elevator", "Elevator") },
              { k: "has_ac", l: tr("createListing.features.items.airConditioning", "Air Conditioning") },
              { k: "has_solar_water", l: tr("createListing.features.items.solarWaterHeating", "Solar Water Heating") },
              { k: "has_storage", l: tr("createListing.features.items.storageSpace", "Storage Space") },
              { k: "has_secure_door", l: tr("createListing.features.items.secureDoor", "Secure Door") },
              { k: "has_alarm", l: tr("createListing.features.items.alarm", "Alarm") },
              { k: "has_cctv", l: tr("createListing.features.items.cctv", "CCTV") },
              { k: "has_security", l: tr("createListing.features.items.securitySystem", "Security System") },
              { k: "has_fireplace", l: tr("createListing.features.items.fireplace", "Fireplace") },
              { k: "has_underfloor_heating", l: tr("createListing.features.items.underfloorHeating", "Underfloor Heating") },
              { k: "has_furnished", l: tr("createListing.features.items.furnished", "Furnished") },
              { k: "has_double_glazing", l: tr("createListing.features.items.doubleGlazing", "Double Glazing") },
              { k: "has_window_screens", l: tr("createListing.features.items.windowScreens", "Window Screens") },
              { k: "has_attic", l: tr("createListing.features.items.attic", "Attic") },
              { k: "has_internal_staircase", l: tr("createListing.features.items.internalStaircase", "Internal Staircase") },
              { k: "has_smart_home", l: tr("createListing.features.items.smartHome", "Smart Home") },
              { k: "has_night_power", l: tr("createListing.features.items.nightPowerRate", "Night Power Rate") },
              { k: "has_satellite", l: tr("createListing.features.items.satelliteReceiver", "Satellite Receiver") },
              { k: "has_painted", l: tr("createListing.features.items.painted", "Painted") },
              ...isCommercial(pt) ? [
                { k: "has_equipped", l: tr("createListing.features.items.equipped", "Equipped") },
                { k: "has_three_phase_power", l: tr("createListing.features.items.threePhasePower", "3-Phase Power") },
                { k: "has_structured_cabling", l: tr("createListing.features.items.structuredCabling", "Structured Cabling") },
              ] : [],
            ].map(({ k, l }) => (
              <ToggleChip key={k} active={(form as unknown as Record<string, unknown>)[k] as boolean} onClick={() => toggle(k)}>{l}</ToggleChip>
            ))}
          </div>

          <SectionTitle>{tr("createListing.features.external", "External")}</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {[
              { k: "has_parking", l: tr("createListing.features.items.parking", "Parking") },
              { k: "has_balcony", l: tr("createListing.features.items.balcony", "Balcony") },
              { k: "has_garden", l: tr("createListing.features.items.garden", "Garden") },
              { k: "has_pool", l: tr("createListing.features.items.pool", "Pool") },
              { k: "has_view", l: tr("createListing.features.items.view", "View") },
              { k: "has_facade", l: tr("createListing.features.items.facade", "Facade") },
              { k: "has_awning", l: tr("createListing.features.items.awning", "Awning") },
              { k: "has_disability_access", l: tr("createListing.features.items.disabilityAccess", "Disability Access") },
              { k: "is_corner", l: tr("createListing.features.items.cornerProperty", "Corner Property") },
              { k: "is_penthouse", l: tr("createListing.features.items.penthouse", "Penthouse") },
              ...isCommercial(pt) ? [{ k: "has_loading_dock", l: tr("createListing.features.items.loadingDock", "Loading Dock") }] : [],
            ].map(({ k, l }) => (
              <ToggleChip key={k} active={(form as unknown as Record<string, unknown>)[k] as boolean} onClick={() => toggle(k)}>{l}</ToggleChip>
            ))}
          </div>

          <SectionTitle>{tr("createListing.features.constructionCharacteristics", "Construction Characteristics")}</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {[
              { k: "is_neoclassical", l: tr("createListing.features.items.neoclassical", "Neoclassical") },
              { k: "is_preserved", l: tr("createListing.features.items.preservedBuilding", "Preserved Building") },
              { k: "has_virtual_tour", l: tr("createListing.features.items.virtualTour", "Virtual Tour") },
              { k: "has_video_tour", l: tr("createListing.features.items.videoTour", "Video Tour") },
            ].map(({ k, l }) => (
              <ToggleChip key={k} active={(form as unknown as Record<string, unknown>)[k] as boolean} onClick={() => toggle(k)}>{l}</ToggleChip>
            ))}
          </div>

          <SectionTitle>{tr("createListing.features.suitableFor", "Suitable For")}</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {[
              { k: "suitable_student", l: tr("createListing.features.items.students", "Students") },
              { k: "suitable_holiday", l: tr("createListing.features.items.holidayHome", "Holiday Home") },
              { k: "suitable_investment", l: tr("createListing.features.items.investment", "Investment") },
              { k: "suitable_commercial_use", l: tr("createListing.features.items.commercialUse", "Commercial Use") },
            ].map(({ k, l }) => (
              <ToggleChip key={k} active={(form as unknown as Record<string, unknown>)[k] as boolean} onClick={() => toggle(k)}>{l}</ToggleChip>
            ))}
          </div>
        </>
      )}

      {isLand(pt) && (
        <>
          <SectionTitle>{tr("createListing.features.landClassification", "Land Classification")}</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {[
              { k: "is_buildable", l: tr("createListing.features.items.buildable", "Buildable") },
              { k: "within_city_plan", l: tr("createListing.features.items.withinCityPlan", "Within City Plan") },
              { k: "within_settlement", l: tr("createListing.features.items.withinSettlement", "Within Settlement") },
              { k: "has_land_concession", l: tr("createListing.features.items.landConcession", "Land Concession") },
              { k: "is_corner", l: tr("createListing.features.items.cornerPlot", "Corner Plot") },
              { k: "has_view", l: tr("createListing.features.items.view", "View") },
              { k: "has_facade", l: tr("createListing.features.items.facade", "Facade") },
            ].map(({ k, l }) => (
              <ToggleChip key={k} active={(form as unknown as Record<string, unknown>)[k] as boolean} onClick={() => toggle(k)}>{l}</ToggleChip>
            ))}
          </div>

          <SectionTitle>{tr("createListing.features.utilities", "Utilities")}</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {[
              { k: "has_water_supply", l: tr("createListing.features.items.waterSupply", "Water Supply") },
              { k: "has_electricity_supply", l: tr("createListing.features.items.electricitySupply", "Electricity Supply") },
            ].map(({ k, l }) => (
              <ToggleChip key={k} active={(form as unknown as Record<string, unknown>)[k] as boolean} onClick={() => toggle(k)}>{l}</ToggleChip>
            ))}
          </div>

          <SectionTitle>{tr("createListing.features.suitableFor", "Suitable For")}</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {[
              { k: "suitable_holiday", l: tr("createListing.features.items.tourismDevelopment", "Tourism Development") },
              { k: "suitable_investment", l: tr("createListing.features.items.investment", "Investment") },
              { k: "suitable_commercial_use", l: tr("createListing.features.items.commercial", "Commercial") },
            ].map(({ k, l }) => (
              <ToggleChip key={k} active={(form as unknown as Record<string, unknown>)[k] as boolean} onClick={() => toggle(k)}>{l}</ToggleChip>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
