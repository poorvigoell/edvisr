import { api } from "./api";
import type { Classroom, Teacher } from "./api";

export async function loadTeacherAndClasses(): Promise<{
  teacher: Teacher;
  classes: Classroom[];
}> {
  const teacher = await api.getMe();
  const classes = await api.getClasses(teacher.id);
  if (classes.length === 0) {
    throw new Error("No classes found for this teacher.");
  }

  return { teacher, classes };
}
