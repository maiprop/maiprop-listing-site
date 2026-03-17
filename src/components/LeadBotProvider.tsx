import { createContext, useContext, useState, useCallback, ReactNode } from "react";

type LeadBotContextType = {
  openWithLocation: (location: string) => void;
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
  pendingLocation: string;
};

const LeadBotContext = createContext<LeadBotContextType>({
  openWithLocation: () => {},
  isOpen: false,
  setIsOpen: () => {},
  pendingLocation: "",
});

export const useLeadBot = () => useContext(LeadBotContext);

export const LeadBotProvider = ({ children }: { children: ReactNode }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [pendingLocation, setPendingLocation] = useState("");

  const openWithLocation = useCallback((location: string) => {
    setPendingLocation(location);
    setIsOpen(true);
  }, []);

  return (
    <LeadBotContext.Provider value={{ openWithLocation, isOpen, setIsOpen, pendingLocation }}>
      {children}
    </LeadBotContext.Provider>
  );
};
