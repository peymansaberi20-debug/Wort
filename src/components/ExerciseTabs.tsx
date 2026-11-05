// src/components/ExerciseTabs.tsx
import React, { useState } from 'react';
import { EXERCISES_LIST, ExerciseCategory } from '../data/exercises';

interface Props {
  onSelectExercise: (exerciseId: string) => void;
}

export const ExerciseTabs: React.FC<Props> = ({ onSelectExercise }) => {
  const [activeTab, setActiveTab] = useState<ExerciseCategory>('vocabulary');

  const filteredExercises = EXERCISES_LIST.filter(ex => ex.category === activeTab);

  return (
    <div className="w-full p-4">
      {/* Tab Buttons */}
      <div className="flex border-b border-gray-200 mb-6 rtl:space-x-reverse">
        <button
          className={`py-3 px-6 text-lg font-medium border-b-2 transition-colors ${
            activeTab === 'vocabulary'
              ? 'border-blue-600 text-blue-600 font-bold'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('vocabulary')}
        >
          Wortschatz üben
        </button>
        <button
          className={`py-3 px-6 text-lg font-medium border-b-2 transition-colors ${
            activeTab === 'grammar'
              ? 'border-blue-600 text-blue-600 font-bold'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('grammar')}
        >
          Grammatik üben
        </button>
      </div>

      {/* Exercise List Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredExercises.map(ex => (
          <div
            key={ex.id}
            onClick={() => onSelectExercise(ex.id)}
            className="p-5 bg-white border border-gray-200 rounded-xl cursor-pointer hover:shadow-md transition-all"
          >
            <h3 className="text-lg font-semibold text-gray-800 mb-1">{ex.title}</h3>
            <p className="text-sm text-gray-600">{ex.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
};
