import React, { useState } from 'react';
import { EXERCISES_LIST } from '../../config/exercises';
import { ExerciseCategory } from '../../types/exercise';

interface Props {
  onSelectExercise: (exerciseId: string) => void;
  activeExerciseId?: string;
}

export const ExerciseNavigation: React.FC<Props> = ({ onSelectExercise, activeExerciseId }) => {
  const [activeTab, setActiveTab] = useState<ExerciseCategory>('vocabulary');

  const filteredExercises = EXERCISES_LIST.filter(ex => ex.category === activeTab);

  return (
    <div className="exercise-navigation-container">
      {/* Exercise Tabs */}
      <div className="flex border-b border-gray-200 mb-6 rtl:space-x-reverse" role="tablist">
        <button
          role="tab"
          aria-selected={activeTab === 'vocabulary'}
          className={`py-3 px-6 text-lg font-medium transition-colors border-b-2 ${
            activeTab === 'vocabulary'
              ? 'border-blue-600 text-blue-600 font-bold'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('vocabulary')}
        >
          Wortschatz üben
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'grammar'}
          className={`py-3 px-6 text-lg font-medium transition-colors border-b-2 ${
            activeTab === 'grammar'
              ? 'border-blue-600 text-blue-600 font-bold'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('grammar')}
        >
          Grammatik üben
        </button>
      </div>

      {/* Exercise Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredExercises.map((exercise) => (
          <div
            key={exercise.id}
            onClick={() => onSelectExercise(exercise.id)}
            className={`p-5 rounded-xl border cursor-pointer transition-all hover:shadow-md ${
              activeExerciseId === exercise.id
                ? 'border-blue-500 bg-blue-50/30'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <h3 className="text-xl font-semibold mb-2 text-gray-800">{exercise.title}</h3>
            <p className="text-gray-600 text-sm leading-relaxed">{exercise.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
};
