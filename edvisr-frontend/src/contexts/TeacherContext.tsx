import { createContext, useContext, useState, useEffect } from "react";
import type { ReactNode } from "react";
import { api } from "../lib/api";
import type { Teacher, Classroom } from "../lib/api";

type TeacherContextType = {
  teacher: Teacher | null;
  classes: Classroom[];
  selectedClassId: number | null;
  alertsCount: number;
  alerts: any[];
  isLoading: boolean;
  setSelectedClassId: (id: number | null) => void;
  refreshContext: () => Promise<void>;
  logout: () => void;
};

const TeacherContext = createContext<TeacherContextType | undefined>(undefined);

export function TeacherProvider({ children }: { children: ReactNode }) {
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [classes, setClasses] = useState<Classroom[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [alertsCount, setAlertsCount] = useState<number>(0);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchContextData = async () => {
    try {
      const me = await api.getMe();
      setTeacher(me);

      const myClasses = await api.getClasses();
      setClasses(myClasses);
      
      if (myClasses.length > 0 && selectedClassId === null) {
        setSelectedClassId(myClasses[0].id);
      }

      try {
        const [{ count }, myAlerts] = await Promise.all([
          api.getAlertsCount(),
          api.getAlerts()
        ]);
        setAlertsCount(count);
        setAlerts(myAlerts);
      } catch (err) {
        console.error("Failed to fetch alerts data", err);
      }
    } catch (err) {
      setTeacher(null);
      setClasses([]);
      setSelectedClassId(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchContextData();
  }, []);

  const refreshContext = async () => {
    await fetchContextData();
  };

  const logout = () => {
    setTeacher(null);
    setClasses([]);
    setSelectedClassId(null);
    setAlertsCount(0);
  };

  return (
    <TeacherContext.Provider
      value={{
        teacher,
        classes,
        selectedClassId,
        alertsCount,
        alerts,
        isLoading,
        setSelectedClassId,
        refreshContext,
        logout,
      }}
    >
      {children}
    </TeacherContext.Provider>
  );
}

export function useTeacher() {
  const context = useContext(TeacherContext);
  if (context === undefined) {
    throw new Error("useTeacher must be used within a TeacherProvider");
  }
  return context;
}
