import React from 'react';

const journeySteps = [
  { 
    label: 'Submitted', 
    icon: '/checklist.gif',
    iconEmoji: '📝', 
    key: 'submitted'
  },
  { 
    label: 'Tracking', 
    icon: '/location.gif',
    iconEmoji: '📍', 
    key: 'tracking'
  },
  { 
    label: 'Accepted', 
    icon: '/checklist.gif',
    iconEmoji: '✅', 
    key: 'accepted'
  },
  { 
    label: 'En Route', 
    icon: '/bus-journey.gif',
    iconEmoji: '🚐', 
    key: 'en_route'
  },
  { 
    label: 'Picked Up', 
    icon: '/destination.gif',
    iconEmoji: '🎉', 
    key: 'picked_up'
  },
  { 
    label: 'Completed', 
    icon: '/hotel.gif',
    iconEmoji: '🏁', 
    key: 'completed'
  }
];

export default function HorizontalJourney({ status, hasRequestId, hasCoords }) {
  const getStepStatus = (stepKey) => {
    if (stepKey === 'submitted') return hasRequestId;
    if (stepKey === 'tracking') return hasCoords;
    if (stepKey === 'accepted') return status === 'accepted' || status === 'picked_up' || status === 'completed';
    if (stepKey === 'en_route') return status === 'accepted' || status === 'picked_up' || status === 'completed';
    if (stepKey === 'picked_up') return status === 'picked_up' || status === 'completed';
    if (stepKey === 'completed') return status === 'completed';
    return false;
  };

  const getActiveIndex = () => {
    for (let i = 0; i < journeySteps.length; i++) {
      const current = getStepStatus(journeySteps[i].key);
      const next = journeySteps[i + 1];
      if (current && (!next || !getStepStatus(next.key))) {
        return i;
      }
    }
    return -1;
  };

  const activeIndex = getActiveIndex();

  return (
    <div className="w-full overflow-x-auto pb-4 scrollbar-hide">
      <div className="min-w-[700px] sm:min-w-full px-2">
        <div className="relative flex items-center justify-between gap-2">
          {/* Main connection line */}
          <div className="absolute top-10 left-8 right-8 h-1 bg-slate-700/50 rounded-full z-0"></div>
          
          {journeySteps.map((step, index) => {
            const isDone = getStepStatus(step.key);
            const isActive = index === activeIndex;
            const prevDone = index > 0 && getStepStatus(journeySteps[index - 1].key);
            
            return (
              <React.Fragment key={step.key}>
                {/* Progress line between steps */}
                {index > 0 && (
                  <div 
                    className={`absolute top-10 h-1 z-0 transition-all duration-700 ${
                      prevDone && isDone
                        ? 'bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-500' 
                        : prevDone
                        ? 'bg-gradient-to-r from-emerald-500 to-slate-700'
                        : 'bg-slate-700'
                    }`}
                    style={{
                      left: `${(index - 0.5) * (100 / journeySteps.length)}%`,
                      width: `${100 / journeySteps.length - 12}%`,
                      transform: 'translateX(-50%)'
                    }}
                  ></div>
                )}
                
                <div className="relative z-10 flex flex-col items-center flex-1 min-w-[80px]">
                  {/* Icon Circle */}
                  <div 
                    className={`
                      w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center
                      transition-all duration-500 transform overflow-hidden
                      ${isDone 
                        ? 'bg-gradient-to-br from-emerald-500 to-green-600 scale-110 sm:scale-110 shadow-xl shadow-emerald-500/50 border-2 border-emerald-400' 
                        : 'bg-slate-700 scale-100 border-2 border-slate-600'
                      }
                      ${isActive && !isDone ? 'ring-4 ring-emerald-400/30 animate-pulse bg-slate-600' : ''}
                    `}
                  >
                    {isDone ? (
                      <span className="text-white text-xl sm:text-2xl font-bold">✓</span>
                    ) : (
                      <img 
                        src={step.icon} 
                        alt={step.label} 
                        className="w-8 h-8 sm:w-10 sm:h-10 object-contain"
                        onError={(e) => {
                          // Fallback to emoji if image fails to load
                          e.target.outerHTML = `<span class="text-xl sm:text-2xl">${step.iconEmoji}</span>`;
                        }}
                      />
                    )}
                  </div>
                  
                  {/* Label */}
                  <div className="mt-2 text-center min-h-[40px] sm:min-h-[50px]">
                    <div className={`text-[10px] sm:text-xs font-bold ${isDone ? 'text-emerald-400' : isActive ? 'text-slate-300' : 'text-slate-500'}`}>
                      {step.label}
                    </div>
                    {isDone && (
                      <div className="text-[9px] text-emerald-400 mt-0.5 font-semibold">Completed</div>
                    )}
                    {isActive && !isDone && (
                      <div className="text-[9px] text-emerald-400 mt-0.5 animate-pulse">In progress...</div>
                    )}
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
