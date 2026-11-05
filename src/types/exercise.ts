export type ExerciseCategory = 'vocabulary' | 'grammar';

export interface ExerciseDefinition {
  id: string;
  title: string;
  description: string;
  category: ExerciseCategory;
  icon: string;
}

export interface ExerciseState {
  exerciseId: string;
  currentStepIndex: number;
  score: number;
  answers: Record<string, any>;
  timerDuration: number; // Duration in seconds selected by user
  timeRemaining: number;
  isCompleted: boolean;
}
