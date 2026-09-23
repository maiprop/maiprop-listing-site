import type { RefObject } from "react";
import {
  Flame,
  MapPin,
  Shield,
  Euro,
  Loader2,
  Sparkles,
  Hash,
  Upload,
  X,
  ImageIcon,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { NominatimAddressSuggestion } from "@/hooks/useNominatimAddressSuggestions";
import { KAEK_MAX_LENGTH, normalizeKaek } from "@/lib/firesaleValidation";
import {
  getPhotoSelectionText,
  propertyTypeLabel,
  propertyTypeOptions,
  ui,
  type PhotoSelectHandler,
  type QuickSaleErrors,
  type QuickSaleFieldUpdater,
  type QuickSaleFormValues,
} from "./quickSaleFormModel";

const QuickSaleHeader = ({ step }: { step: number }) => (
  <div className="px-5 sm:px-7 py-5 border-b border-border bg-gradient-to-r from-destructive/5 to-transparent">
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl bg-destructive/10 flex items-center justify-center">
        <Flame className="w-4.5 h-4.5 text-destructive" />
      </div>
      <div>
        <h3 className="font-display font-bold text-base">{ui("Get Your Preliminary Cash Offer", "Λάβετε προκαταρκτική προσφορά μετρητών")}</h3>
        <p className="text-xs text-muted-foreground">{ui("Free - No obligation - Confidential", "Δωρεάν - Χωρίς υποχρέωση - Εμπιστευτικό")}</p>
      </div>
      <div className="ml-auto flex items-center gap-2">
        {[1, 2].map((n) => (
          <div key={n} className={`w-7 h-1.5 rounded-full transition-all ${step >= n ? "bg-primary" : "bg-border"}`} />
        ))}
        <span className="text-[10px] text-muted-foreground ml-1">{step}/2</span>
      </div>
    </div>
  </div>
);

const SellerGateBanner = ({
  authPending,
  canSubmitQuickSale,
  userExists,
  onSellerCta,
}: {
  authPending: boolean;
  canSubmitQuickSale: boolean;
  userExists: boolean;
  onSellerCta: () => void;
}) => {
  if (authPending) {
    return (
      <div className="rounded-xl bg-muted border border-border p-3 flex items-start gap-3">
        <Loader2 className="w-4 h-4 text-primary mt-0.5 shrink-0 animate-spin" />
        <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{ui("Checking seller profile", "Έλεγχος προφίλ πωλητή")}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {ui("We are loading your account details before enabling Quick Sale submissions.", "Φορτώνουμε τα στοιχεία λογαριασμού πριν ενεργοποιηθεί η υποβολή Quick Sale.")}
          </p>
        </div>
      </div>
    );
  }
  if (canSubmitQuickSale) return null;

  return (
    <div className="rounded-xl bg-muted border border-border p-3 flex items-start gap-3">
      <Lock className="w-4 h-4 text-primary mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{ui("Seller account required", "Απαιτείται λογαριασμός πωλητή")}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {ui("To submit a Quick Sale request, you must have a Seller profile. It's free - Pro is not required.", "Για να υποβάλετε αίτημα Quick Sale, χρειάζεστε προφίλ πωλητή. Είναι δωρεάν - δεν απαιτείται Pro.")}
        </p>
        <div className="mt-2">
          <Button size="sm" className="bg-gradient-primary border-0 text-primary-foreground" onClick={onSellerCta}>
            {userExists ? ui("Become a Seller", "Μετάβαση σε πωλητή") : ui("Sign up as Seller", "Εγγραφή ως πωλητής")}
          </Button>
        </div>
      </div>
    </div>
  );
};

const AddressField = ({
  form,
  errors,
  disabled,
  addressLoading,
  addressSuggestions,
  onUpdate,
  onSelectSuggestion,
  onClearSuggestions,
}: {
  form: QuickSaleFormValues;
  errors: QuickSaleErrors;
  disabled: boolean;
  addressLoading: boolean;
  addressSuggestions: NominatimAddressSuggestion[];
  onUpdate: QuickSaleFieldUpdater;
  onSelectSuggestion: (suggestion: NominatimAddressSuggestion) => void;
  onClearSuggestions: () => void;
}) => (
  <div>
    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
      {ui("Property Address", "Διεύθυνση ακινήτου")} <span className="text-destructive">*</span>
    </label>
    <div className="flex gap-2 bg-muted border border-border rounded-xl px-3 py-2.5 focus-within:border-primary transition-colors">
      <MapPin className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
      <input
        type="text"
        placeholder={ui("e.g. Kifisia, Dekelia 24, Athens", "π.χ. Κηφισιά, Δεκελείας 24, Αθήνα")}
        value={form.address}
        disabled={disabled}
        onChange={disabled ? undefined : (e) => onUpdate("address", e.target.value)}
        className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none disabled:cursor-not-allowed disabled:opacity-70"
      />
    </div>
    {errors.address && <p className="mt-1 text-xs text-destructive">{errors.address}</p>}
    {addressLoading && <p className="mt-1 text-[10px] text-muted-foreground">{ui("Searching address suggestions...", "Αναζήτηση προτάσεων διεύθυνσης...")}</p>}
    {!addressLoading && addressSuggestions.length > 0 && (
      <div className="mt-1 bg-background border border-border rounded-xl shadow-md text-sm max-h-40 overflow-auto">
        {addressSuggestions.map((suggestion) => (
          <button
            key={suggestion.display_name}
            type="button"
            onClick={() => {
              onSelectSuggestion(suggestion);
              onClearSuggestions();
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-muted/80"
          >
            {suggestion.display_name}
          </button>
        ))}
      </div>
    )}
  </div>
);

const KaekField = ({ form, errors, disabled, onUpdate }: { form: QuickSaleFormValues; errors: QuickSaleErrors; disabled: boolean; onUpdate: QuickSaleFieldUpdater }) => (
  <div>
    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
      KAEK <span className="text-destructive">*</span>{" "}
      <span className="text-[10px] font-normal normal-case text-muted-foreground">({ui("Greek cadastral property code", "Κωδικός Αριθμός Εθνικού Κτηματολογίου")})</span>
    </label>
    <div className="flex gap-2 bg-muted border border-border rounded-xl px-3 py-2.5 focus-within:border-primary transition-colors">
      <Hash className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
      <input
        type="text"
        placeholder="e.g. 050240601001/0/1"
        value={form.kaek}
        maxLength={KAEK_MAX_LENGTH}
        inputMode="numeric"
        disabled={disabled}
        onChange={disabled ? undefined : (e) => onUpdate("kaek", normalizeKaek(e.target.value))}
        className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none font-mono disabled:cursor-not-allowed disabled:opacity-70"
      />
    </div>
    <p className="mt-1 text-[10px] text-muted-foreground">
      {ui("Greek KAEK is normally 12 digits. Add sub-property parts only when applicable, e.g. /0/1.", "Το ΚΑΕΚ έχει συνήθως 12 ψηφία. Προσθέστε τμήματα υπο-ιδιοκτησίας μόνο όταν υπάρχουν, π.χ. /0/1.")}
    </p>
    {errors.kaek && <p className="mt-1 text-xs text-destructive">{errors.kaek}</p>}
  </div>
);

const PropertyMetricsFields = ({
  form,
  errors,
  disabled,
  onUpdate,
}: {
  form: QuickSaleFormValues;
  errors: QuickSaleErrors;
  disabled: boolean;
  onUpdate: QuickSaleFieldUpdater;
}) => (
  <div className="grid grid-cols-2 gap-4">
    <div>
      <label htmlFor="quick-sale-property-type" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
        {ui("Property Type", "Τύπος ακινήτου")} <span className="text-destructive">*</span>
      </label>
      <select
        id="quick-sale-property-type"
        value={form.propertyType}
        disabled={disabled}
        onChange={disabled ? undefined : (e) => onUpdate("propertyType", e.target.value)}
        className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary appearance-none capitalize disabled:cursor-not-allowed disabled:opacity-70"
      >
        <option value="" className="bg-card">{ui("Select type...", "Επιλέξτε τύπο...")}</option>
        {propertyTypeOptions.map((type) => (
          <option key={type.value} value={type.value} className="bg-card">{propertyTypeLabel(type.value, type.label)}</option>
        ))}
      </select>
      {errors.propertyType && <p className="mt-1 text-xs text-destructive">{errors.propertyType}</p>}
    </div>
    <div>
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
        {ui("Size (m²)", "Εμβαδόν (τ.μ.)")} <span className="text-destructive">*</span>
      </label>
      <input
        type="number"
        placeholder="e.g. 120"
        value={form.sqm}
        disabled={disabled}
        onChange={disabled ? undefined : (e) => onUpdate("sqm", e.target.value)}
        className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors disabled:cursor-not-allowed disabled:opacity-70"
      />
      {errors.sqm && <p className="mt-1 text-xs text-destructive">{errors.sqm}</p>}
    </div>
    <div className="col-span-2">
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
        {ui("Asking Price", "Ζητούμενη τιμή")} <span className="text-destructive">*</span>
      </label>
      <div className="flex gap-2 bg-muted border border-border rounded-xl px-3 py-2.5 focus-within:border-primary transition-colors">
        <Euro className="w-4 h-4 text-muted-foreground shrink-0" />
        <input
          type="number"
          placeholder={ui("Your target EUR", "Η επιθυμητή τιμή σε EUR")}
          value={form.askingPrice}
          disabled={disabled}
          onChange={disabled ? undefined : (e) => onUpdate("askingPrice", e.target.value)}
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none disabled:cursor-not-allowed disabled:opacity-70"
        />
      </div>
      {errors.askingPrice && <p className="mt-1 text-xs text-destructive">{errors.askingPrice}</p>}
    </div>
    <div className="col-span-2">
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
        {ui("Construction Year", "Έτος κατασκευής")} <span className="text-destructive">*</span>
      </label>
      <input
        type="number"
        placeholder="e.g. 1998"
        value={form.constructionYear}
        disabled={disabled}
        onChange={disabled ? undefined : (e) => onUpdate("constructionYear", e.target.value)}
        className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors disabled:cursor-not-allowed disabled:opacity-70"
      />
      {errors.constructionYear && <p className="mt-1 text-xs text-destructive">{errors.constructionYear}</p>}
    </div>
  </div>
);

const EmptyPhotoUploadButton = ({ disabled, fileInputRef }: { disabled: boolean; fileInputRef: RefObject<HTMLInputElement> }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={() => fileInputRef.current?.click()}
    className="w-full flex flex-col items-center justify-center gap-2 bg-muted border-2 border-dashed border-border rounded-xl py-7 text-muted-foreground hover:border-primary/40 hover:bg-primary/5 transition-all duration-200 group disabled:cursor-not-allowed disabled:hover:border-border disabled:hover:bg-muted disabled:opacity-70"
  >
    <div className="w-10 h-10 rounded-full bg-muted-foreground/10 group-hover:bg-primary/10 flex items-center justify-center transition-colors">
      <Upload className="w-5 h-5 group-hover:text-primary transition-colors" />
    </div>
    <div className="text-center">
      <p className="text-sm font-medium group-hover:text-foreground transition-colors">{ui("Click to upload photos", "Πατήστε για ανέβασμα φωτογραφιών")}</p>
      <p className="text-[11px] mt-0.5">{ui("JPG, PNG - Max 10MB each", "JPG, PNG - Μέγ. 10MB ανά αρχείο")}</p>
    </div>
  </button>
);

const PhotoPreviewTile = ({
  src,
  index,
  disabled,
  onRemovePhoto,
}: {
  src: string;
  index: number;
  disabled: boolean;
  onRemovePhoto: (index: number) => void;
}) => (
  <div className="relative group rounded-xl overflow-hidden aspect-square bg-muted border border-border">
    <img src={src} alt="" className="w-full h-full object-cover" />
    <button
      type="button"
      aria-label={ui("Remove photo", "Remove photo")}
      disabled={disabled}
      onClick={() => onRemovePhoto(index)}
      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-background/90 border border-border flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity hover:bg-destructive hover:border-destructive hover:text-destructive-foreground disabled:hidden"
    >
      <X className="w-3 h-3" />
    </button>
  </div>
);

const AddPhotoTile = ({ disabled, fileInputRef }: { disabled: boolean; fileInputRef: RefObject<HTMLInputElement> }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={() => fileInputRef.current?.click()}
    className="aspect-square rounded-xl border-2 border-dashed border-border bg-muted hover:border-primary/40 hover:bg-primary/5 flex items-center justify-center transition-all disabled:cursor-not-allowed disabled:hover:border-border disabled:hover:bg-muted disabled:opacity-70"
  >
    <ImageIcon className="w-5 h-5 text-muted-foreground" />
  </button>
);

const PhotoPreviewGrid = ({
  photoPreviews,
  disabled,
  fileInputRef,
  onRemovePhoto,
}: {
  photoPreviews: string[];
  disabled: boolean;
  fileInputRef: RefObject<HTMLInputElement>;
  onRemovePhoto: (index: number) => void;
}) => (
  <div className="grid grid-cols-3 gap-2">
    {photoPreviews.map((src, index) => (
      <PhotoPreviewTile key={src} src={src} index={index} disabled={disabled} onRemovePhoto={onRemovePhoto} />
    ))}
    {photoPreviews.length < 10 && <AddPhotoTile disabled={disabled} fileInputRef={fileInputRef} />}
  </div>
);

const PhotoUploadField = ({
  errors,
  photoPreviews,
  disabled,
  fileInputRef,
  onPhotoSelect,
  onRemovePhoto,
}: {
  errors: QuickSaleErrors;
  photoPreviews: string[];
  disabled: boolean;
  fileInputRef: RefObject<HTMLInputElement>;
  onPhotoSelect: PhotoSelectHandler;
  onRemovePhoto: (index: number) => void;
}) => (
  <div>
    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
      {ui("Property Photos", "Φωτογραφίες ακινήτου")} <span className="text-destructive">*</span>{" "}
      <span className="text-[10px] font-normal normal-case text-muted-foreground">{ui("(min 5, up to 10 images)", "(ελάχ. 5, έως 10 εικόνες)")}</span>
    </label>
    <input ref={fileInputRef} type="file" accept="image/*" multiple disabled={disabled} className="hidden" onChange={disabled ? undefined : onPhotoSelect} />
    {photoPreviews.length === 0 ? (
      <EmptyPhotoUploadButton disabled={disabled} fileInputRef={fileInputRef} />
    ) : (
      <div className="space-y-3">
        <PhotoPreviewGrid photoPreviews={photoPreviews} disabled={disabled} fileInputRef={fileInputRef} onRemovePhoto={onRemovePhoto} />
        <p className="text-[10px] text-muted-foreground">
          {ui(getPhotoSelectionText(photoPreviews.length), `${photoPreviews.length} φωτογραφ${photoPreviews.length === 1 ? "ία επιλέχθηκε" : "ίες επιλέχθηκαν"}`)}
          {photoPreviews.length < 5 && ui(" - add at least 5 photos to continue", " - προσθέστε τουλάχιστον 5 φωτογραφίες για συνέχεια")}
        </p>
      </div>
    )}
    {errors.photos && <p className="mt-1 text-xs text-destructive">{errors.photos}</p>}
  </div>
);

const NotesField = ({ form, errors, disabled, onUpdate }: { form: QuickSaleFormValues; errors: QuickSaleErrors; disabled: boolean; onUpdate: QuickSaleFieldUpdater }) => (
  <div>
    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
      {ui("Additional Notes", "Πρόσθετες σημειώσεις")} <span className="text-destructive">*</span>
    </label>
    <textarea
      rows={2}
      placeholder={ui("Legal issues, urgent timeline, property history...", "Νομικά θέματα, επείγον χρονοδιάγραμμα, ιστορικό ακινήτου...")}
      value={form.notes}
      disabled={disabled}
      onChange={disabled ? undefined : (e) => onUpdate("notes", e.target.value)}
      className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary resize-none transition-colors disabled:cursor-not-allowed disabled:opacity-70"
    />
    {errors.notes && <p className="mt-1 text-xs text-destructive">{errors.notes}</p>}
  </div>
);

type StepOneProps = {
  authPending: boolean;
  canSubmitQuickSale: boolean;
  formLocked: boolean;
  userExists: boolean;
  form: QuickSaleFormValues;
  errors: QuickSaleErrors;
  addressLoading: boolean;
  addressSuggestions: NominatimAddressSuggestion[];
  photoPreviews: string[];
  fileInputRef: RefObject<HTMLInputElement>;
  aiLoading: boolean;
  onSellerCta: () => void;
  onUpdate: QuickSaleFieldUpdater;
  onSelectAddressSuggestion: (suggestion: NominatimAddressSuggestion) => void;
  onClearAddressSuggestions: () => void;
  onPhotoSelect: PhotoSelectHandler;
  onRemovePhoto: (index: number) => void;
  onContinue: () => void;
};

const StepOneButtonContent = ({ aiLoading, locked }: { aiLoading: boolean; locked: boolean }) => {
  if (locked) {
    return (
      <>
        <Lock className="w-4 h-4 mr-2" />
        {ui("Seller profile required", "Απαιτείται προφίλ πωλητή")}
      </>
    );
  }

  if (aiLoading) {
    return (
      <>
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        {ui("Calculating AI estimate...", "Υπολογισμός AI εκτίμησης...")}
      </>
    );
  }

  return (
    <>
      <Sparkles className="w-4 h-4 mr-2" />
      {ui("Get AI Estimate & Continue", "Λήψη AI εκτίμησης & συνέχεια")}
    </>
  );
};

const QuickSaleStepOne = (props: StepOneProps) => (
  <div className="space-y-5">
    <h4 className="font-display font-semibold text-sm">{ui("Property Details", "Στοιχεία ακινήτου")}</h4>
    <SellerGateBanner
      authPending={props.authPending}
      canSubmitQuickSale={props.canSubmitQuickSale}
      userExists={props.userExists}
      onSellerCta={props.onSellerCta}
    />
    <AddressField
      form={props.form}
      errors={props.errors}
      disabled={props.formLocked}
      addressLoading={props.addressLoading}
      addressSuggestions={props.addressSuggestions}
      onUpdate={props.onUpdate}
      onSelectSuggestion={props.onSelectAddressSuggestion}
      onClearSuggestions={props.onClearAddressSuggestions}
    />
    <KaekField form={props.form} errors={props.errors} disabled={props.formLocked} onUpdate={props.onUpdate} />
    <PropertyMetricsFields form={props.form} errors={props.errors} disabled={props.formLocked} onUpdate={props.onUpdate} />
    <PhotoUploadField
      errors={props.errors}
      photoPreviews={props.photoPreviews}
      disabled={props.formLocked}
      fileInputRef={props.fileInputRef}
      onPhotoSelect={props.onPhotoSelect}
      onRemovePhoto={props.onRemovePhoto}
    />
    <NotesField form={props.form} errors={props.errors} disabled={props.formLocked} onUpdate={props.onUpdate} />
    <Button className="w-full bg-gradient-primary border-0 text-primary-foreground h-11" disabled={props.aiLoading || props.formLocked} onClick={props.onContinue}>
      <StepOneButtonContent aiLoading={props.aiLoading} locked={props.formLocked} />
    </Button>
  </div>
);

const EstimateSummary = ({ aiEstimate }: { aiEstimate: number | null }) => {
  return (
    <div className="rounded-xl bg-gradient-to-r from-primary/10 to-accent/5 border border-primary/20 p-4 flex items-center justify-between">
      <div>
        <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">{ui("Market estimate", "Εκτίμηση αγοράς")}</p>
        <p className="font-display font-black text-2xl text-primary">{aiEstimate == null ? ui("Unavailable", "Μη διαθέσιμη") : `€${aiEstimate.toLocaleString()}`}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">{ui("Unverified estimate when available; final offer follows review", "Μη επαληθευμένη εκτίμηση όταν είναι διαθέσιμη· η τελική προσφορά ακολουθεί μετά τον έλεγχο")}</p>
      </div>
    </div>
  );
};

type ContactFieldProps = {
  form: QuickSaleFormValues;
  errors: QuickSaleErrors;
  disabled: boolean;
  onUpdate: QuickSaleFieldUpdater;
};

const ContactNameField = ({ form, errors, disabled, onUpdate }: ContactFieldProps) => (
  <div>
    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
      {ui("Full Name", "Ονοματεπώνυμο")} <span className="text-destructive">*</span>
    </label>
    <input
      type="text"
      placeholder={ui("Your name", "Το όνομά σας")}
      value={form.contactName}
      disabled={disabled}
      onChange={disabled ? undefined : (e) => onUpdate("contactName", e.target.value)}
      className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors disabled:cursor-not-allowed disabled:opacity-70"
    />
    {errors.contactName && <p className="mt-1 text-xs text-destructive">{errors.contactName}</p>}
  </div>
);

const ContactEmailField = ({ form, errors, disabled, onUpdate }: ContactFieldProps) => (
  <div>
    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
      {ui("Email", "Email επικοινωνίας")} <span className="text-destructive">*</span>
    </label>
    <input
      type="email"
      placeholder="email@example.com"
      value={form.contactEmail}
      disabled={disabled}
      onChange={disabled ? undefined : (e) => onUpdate("contactEmail", e.target.value)}
      className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors disabled:cursor-not-allowed disabled:opacity-70"
    />
    {errors.contactEmail && <p className="mt-1 text-xs text-destructive">{errors.contactEmail}</p>}
  </div>
);

const ContactPhoneField = ({ form, errors, disabled, onUpdate }: ContactFieldProps) => (
  <div>
    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
      {ui("Phone", "Τηλέφωνο")} <span className="text-destructive">*</span>
    </label>
    <input
      type="tel"
      placeholder="+30 69..."
      value={form.contactPhone}
      disabled={disabled}
      onChange={disabled ? undefined : (e) => onUpdate("contactPhone", e.target.value)}
      className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors disabled:cursor-not-allowed disabled:opacity-70"
    />
    {errors.contactPhone && <p className="mt-1 text-xs text-destructive">{errors.contactPhone}</p>}
  </div>
);

const ContactMethodFields = (props: ContactFieldProps) => (
  <div className="grid grid-cols-2 gap-4">
    <ContactEmailField {...props} />
    <ContactPhoneField {...props} />
  </div>
);

const ContactFields = (props: ContactFieldProps) => (
  <>
    <ContactNameField {...props} />
    <ContactMethodFields {...props} />
  </>
);

type StepTwoProps = {
  aiEstimate: number | null;
  form: QuickSaleFormValues;
  errors: QuickSaleErrors;
  step2Valid: boolean;
  submitting: boolean;
  uploadingPhotos: boolean;
  formLocked: boolean;
  onUpdate: QuickSaleFieldUpdater;
  onBack: () => void;
  onSubmit: () => void;
};

const SubmitRequestButtonContent = ({ submitting, uploadingPhotos }: { submitting: boolean; uploadingPhotos: boolean }) => {
  if (submitting) {
    return (
      <>
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        {uploadingPhotos ? ui("Uploading photos...", "Ανέβασμα φωτογραφιών...") : ui("Submitting...", "Υποβολή...")}
      </>
    );
  }

  return (
    <>
      <Flame className="w-4 h-4 mr-2" />
      {ui("Submit Quick Sale Request", "Υποβολή αιτήματος Quick Sale")}
    </>
  );
};

const QuickSaleStepTwo = (props: StepTwoProps) => (
  <div className="space-y-5">
    <EstimateSummary aiEstimate={props.aiEstimate} />
    <h4 className="font-display font-semibold text-sm">{ui("Your Contact Details", "Στοιχεία επικοινωνίας")}</h4>
    <p className="text-xs text-muted-foreground -mt-3">{ui("Your information is kept strictly confidential.", "Τα στοιχεία σας παραμένουν αυστηρά εμπιστευτικά.")}</p>
    <ContactFields form={props.form} errors={props.errors} disabled={props.formLocked} onUpdate={props.onUpdate} />
    <div className="rounded-xl bg-muted border border-border p-3 flex items-start gap-3">
      <Shield className="w-4 h-4 text-brand-emerald mt-0.5 shrink-0" />
      <p className="text-xs text-muted-foreground leading-relaxed">
        {ui("Your data is encrypted and shared", "Τα δεδομένα σας κρυπτογραφούνται και κοινοποιούνται")}{" "}
        <strong className="text-foreground">{ui("only with pre-vetted investors", "μόνο σε προελεγμένους επενδυτές")}</strong>
        {ui(" under NDA. We never publish your property publicly.", " με συμφωνητικό εμπιστευτικότητας. Δεν δημοσιεύουμε ποτέ το ακίνητό σας δημόσια.")}
      </p>
    </div>
    <div className="flex gap-3">
      <Button variant="outline" className="border-border" onClick={props.onBack}>{ui("Back", "Πίσω")}</Button>
      <Button
        className="flex-1 bg-gradient-to-r from-destructive to-destructive/80 border-0 text-destructive-foreground h-11"
        disabled={!props.step2Valid || props.submitting || props.formLocked}
        onClick={props.onSubmit}
      >
        <SubmitRequestButtonContent submitting={props.submitting} uploadingPhotos={props.uploadingPhotos} />
      </Button>
    </div>
  </div>
);

type QuickSaleFormViewProps = StepOneProps & StepTwoProps & { step: number };

export const QuickSaleFormView = (props: QuickSaleFormViewProps) => (
  <div className="glass-card rounded-2xl border border-primary/20 overflow-hidden shadow-elevated animate-fade-in">
    <QuickSaleHeader step={props.step} />
    <div className="p-5 sm:p-7">
      {props.step === 1 ? <QuickSaleStepOne {...props} /> : <QuickSaleStepTwo {...props} />}
    </div>
  </div>
);
