import { SectionTitle, ToggleChip } from "@/components/listings/FormPrimitives";
import type { ListingFormData } from "@/hooks/useListingForm";

interface Props {
  form: ListingFormData;
  toggle: (key: string) => void;
}

const isLand = (t: string) => t === "land";
const isCommercial = (t: string) => ["commercial", "office"].includes(t);

export function StepFeatures({ form, toggle }: Props) {
  const pt = form.property_type;

  return (
    <div>
      <h2 className="font-display text-xl font-semibold mb-4">Features & Amenities</h2>

      {!isLand(pt) && (
        <>
          <SectionTitle>Internal</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {[
              { k: "has_elevator", l: "🛗 Elevator" },
              { k: "has_ac", l: "❄️ Air Conditioning" },
              { k: "has_solar_water", l: "☀️ Solar Water Heating" },
              { k: "has_storage", l: "📦 Storage Space" },
              { k: "has_secure_door", l: "🚪 Secure Door" },
              { k: "has_alarm", l: "🔔 Alarm" },
              { k: "has_cctv", l: "📷 CCTV" },
              { k: "has_security", l: "🔒 Security System" },
              { k: "has_fireplace", l: "🔥 Fireplace" },
              { k: "has_underfloor_heating", l: "🌡️ Underfloor Heating" },
              { k: "has_furnished", l: "🛋️ Furnished" },
              { k: "has_double_glazing", l: "🪟 Double Glazing" },
              { k: "has_window_screens", l: "🦟 Window Screens" },
              { k: "has_attic", l: "🏠 Attic" },
              { k: "has_internal_staircase", l: "🪜 Internal Staircase" },
              { k: "has_smart_home", l: "🏡 Smart Home" },
              { k: "has_night_power", l: "⚡ Night Power Rate" },
              { k: "has_satellite", l: "📡 Satellite Receiver" },
              { k: "has_painted", l: "🎨 Painted" },
              ...isCommercial(pt) ? [
                { k: "has_equipped", l: "🔧 Equipped" },
                { k: "has_three_phase_power", l: "⚡ 3-Phase Power" },
                { k: "has_structured_cabling", l: "🔌 Structured Cabling" },
              ] : [],
            ].map(({ k, l }) => (
              <ToggleChip key={k} active={(form as unknown as Record<string, unknown>)[k] as boolean} onClick={() => toggle(k)}>{l}</ToggleChip>
            ))}
          </div>

          <SectionTitle>External</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {[
              { k: "has_parking", l: "🚗 Parking" },
              { k: "has_balcony", l: "🏞️ Balcony" },
              { k: "has_garden", l: "🌿 Garden" },
              { k: "has_pool", l: "🏊 Pool" },
              { k: "has_view", l: "👁️ View" },
              { k: "has_facade", l: "🏛️ Facade" },
              { k: "has_awning", l: "⛱️ Awning" },
              { k: "has_disability_access", l: "♿ Disability Access" },
              { k: "is_corner", l: "📐 Corner Property" },
              { k: "is_penthouse", l: "⭐ Penthouse" },
              ...isCommercial(pt) ? [{ k: "has_loading_dock", l: "🚛 Loading Dock" }] : [],
            ].map(({ k, l }) => (
              <ToggleChip key={k} active={(form as unknown as Record<string, unknown>)[k] as boolean} onClick={() => toggle(k)}>{l}</ToggleChip>
            ))}
          </div>

          <SectionTitle>Construction Characteristics</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {[
              { k: "is_neoclassical", l: "🏛️ Neoclassical" },
              { k: "is_preserved", l: "🏺 Preserved Building" },
              { k: "has_virtual_tour", l: "🥽 Virtual Tour" },
              { k: "has_video_tour", l: "🎥 Video Tour" },
            ].map(({ k, l }) => (
              <ToggleChip key={k} active={(form as unknown as Record<string, unknown>)[k] as boolean} onClick={() => toggle(k)}>{l}</ToggleChip>
            ))}
          </div>

          <SectionTitle>Suitable For</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {[
              { k: "suitable_student", l: "🎓 Students" },
              { k: "suitable_holiday", l: "🌴 Holiday Home" },
              { k: "suitable_investment", l: "💰 Investment" },
              { k: "suitable_commercial_use", l: "🏢 Commercial Use" },
            ].map(({ k, l }) => (
              <ToggleChip key={k} active={(form as unknown as Record<string, unknown>)[k] as boolean} onClick={() => toggle(k)}>{l}</ToggleChip>
            ))}
          </div>
        </>
      )}

      {isLand(pt) && (
        <>
          <SectionTitle>Land Classification</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {[
              { k: "is_buildable", l: "🏗️ Buildable" },
              { k: "within_city_plan", l: "🗺️ Within City Plan" },
              { k: "within_settlement", l: "🏘️ Within Settlement" },
              { k: "has_land_concession", l: "📄 Land Concession" },
              { k: "is_corner", l: "📐 Corner Plot" },
              { k: "has_view", l: "👁️ View" },
              { k: "has_facade", l: "🏛️ Facade" },
            ].map(({ k, l }) => (
              <ToggleChip key={k} active={(form as unknown as Record<string, unknown>)[k] as boolean} onClick={() => toggle(k)}>{l}</ToggleChip>
            ))}
          </div>

          <SectionTitle>Utilities</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {[
              { k: "has_water_supply", l: "💧 Water Supply" },
              { k: "has_electricity_supply", l: "⚡ Electricity Supply" },
            ].map(({ k, l }) => (
              <ToggleChip key={k} active={(form as unknown as Record<string, unknown>)[k] as boolean} onClick={() => toggle(k)}>{l}</ToggleChip>
            ))}
          </div>

          <SectionTitle>Suitable For</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {[
              { k: "suitable_holiday", l: "🌴 Tourism Development" },
              { k: "suitable_investment", l: "💰 Investment" },
              { k: "suitable_commercial_use", l: "🏢 Commercial" },
            ].map(({ k, l }) => (
              <ToggleChip key={k} active={(form as unknown as Record<string, unknown>)[k] as boolean} onClick={() => toggle(k)}>{l}</ToggleChip>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
