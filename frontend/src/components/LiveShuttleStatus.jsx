import React, { useEffect, useState } from 'react';

export default function LiveShuttleStatus({ 
  status, 
  eta, 
  driverLoc, 
  guestLoc,
  requestId,
  routeProgress 
}) {
  const [timeUntilPickup, setTimeUntilPickup] = useState(null);
  const [statusMessage, setStatusMessage] = useState('Waiting for driver acceptance...');
  const [progressPercent, setProgressPercent] = useState(0);

  useEffect(() => {
    if (!status || !requestId) {
      setStatusMessage('Waiting for request...');
      setProgressPercent(0);
      return;
    }

    switch (status) {
      case 'pending':
        setStatusMessage('Request submitted. Waiting for driver...');
        setProgressPercent(10);
        break;
      case 'accepted':
        if (eta && eta.etaMinutes) {
          const minutes = Math.ceil(eta.etaMinutes);
          if (minutes < 1) {
            setStatusMessage('Pick up in < 1 min');
            setProgressPercent(95);
          } else if (minutes < 2) {
            setStatusMessage('Pick up in < 2 min');
            setProgressPercent(90);
          } else if (minutes < 5) {
            setStatusMessage(`Pick up in ${minutes} min`);
            setProgressPercent(80);
          } else if (minutes < 10) {
            setStatusMessage(`Shuttle arriving in ${minutes} min`);
            setProgressPercent(60);
          } else {
            setStatusMessage(`Shuttle en route - ${minutes} min`);
            setProgressPercent(40);
          }
        } else {
          setStatusMessage('Driver accepted. Calculating route...');
          setProgressPercent(20);
        }
        break;
      case 'picked_up':
        setStatusMessage('Shuttle arrived! You have been picked up.');
        setProgressPercent(95);
        break;
      case 'completed':
        setStatusMessage('Ride completed. Thank you!');
        setProgressPercent(100);
        break;
      default:
        setStatusMessage('Waiting...');
        setProgressPercent(0);
    }
  }, [status, eta, requestId]);

  // Calculate time until pickup based on ETA - Updates in real-time
  useEffect(() => {
    if (eta && eta.etaMinutes && status === 'accepted') {
      // Update immediately
      const updateTime = () => {
        const minutes = Math.ceil(eta.etaMinutes);
        if (minutes < 1) {
          setTimeUntilPickup('Arriving now');
        } else if (minutes < 2) {
          setTimeUntilPickup('< 2 min');
        } else {
          setTimeUntilPickup(`${minutes} min`);
        }
      };
      
      updateTime();
      const interval = setInterval(updateTime, 30000); // Update every 30 seconds

      return () => clearInterval(interval);
    } else {
      setTimeUntilPickup(null);
    }
  }, [eta, status]);

  const getStatusColor = () => {
    switch (status) {
      case 'pending':
        return 'from-amber-500 to-orange-500';
      case 'accepted':
        return 'from-blue-500 to-cyan-500';
      case 'picked_up':
        return 'from-green-500 to-emerald-500';
      case 'completed':
        return 'from-slate-500 to-slate-600';
      default:
        return 'from-slate-500 to-slate-600';
    }
  };

  const getRouteLabel = () => {
    if (status === 'accepted' || status === 'picked_up') {
      return 'Route from Your Location to Hotel';
    } else if (status === 'pending') {
      return 'Waiting for driver acceptance...';
    }
    return 'Waiting for route...';
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
      {/* Main Status Bar - Similar to DFW Airport Express */}
      <div className={`bg-gradient-to-r ${getStatusColor()} p-4 sm:p-5`}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 backdrop-blur-sm rounded-lg p-2 sm:p-2.5 flex items-center justify-center">
              <img src="/bus-journey.gif" alt="Shuttle" className="w-8 h-8 sm:w-10 sm:h-10 object-contain" />
            </div>
            <div>
              <div className="text-white font-bold text-base sm:text-lg">Express Shuttle</div>
              <div className="text-white/90 text-xs sm:text-sm flex items-center gap-1">
                <img src="/bus-journey.gif" alt="" className="w-3 h-3 opacity-80" />
                <span>{statusMessage}</span>
              </div>
            </div>
          </div>
          <div className="text-left sm:text-right">
            <div className="text-white/80 text-xs mb-1 flex items-center gap-1">
              <img src="/checklist.gif" alt="" className="w-3 h-3 opacity-80" />
              <span>Status</span>
            </div>
            <div className="text-white font-bold text-base sm:text-lg flex items-center gap-2">
              {status === 'accepted' && driverLoc && (
                <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
              )}
              <span>{timeUntilPickup || statusMessage}</span>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="bg-white/20 backdrop-blur-sm rounded-full h-3 overflow-hidden">
          <div 
            className={`bg-white h-full rounded-full transition-all duration-1000 ease-out flex items-center justify-end pr-1 ${
              status === 'accepted' ? 'animate-pulse' : ''
            }`}
            style={{ width: `${progressPercent}%` }}
          >
            {status === 'accepted' && progressPercent > 15 && (
              <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
            )}
          </div>
        </div>
      </div>

      {/* Details Section - Live Stats */}
      {status === 'accepted' && driverLoc && (
        <div className="p-3 sm:p-4 bg-slate-800/50 border-t border-slate-700">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div className="flex items-center gap-2 bg-slate-900/50 rounded-lg p-2">
              <img src="/bus-journey.gif" alt="" className="w-6 h-6 flex-shrink-0" />
              <div>
                <div className="text-slate-400 text-xs">Estimated Time</div>
                <div className="text-white font-bold text-base">
                  {eta?.etaMinutes ? `${eta.etaMinutes} min` : 'Calculating...'}
                </div>
              </div>
            </div>
            {eta?.distanceKm && (
              <div className="flex items-center gap-2 bg-slate-900/50 rounded-lg p-2">
                <img src="/map.gif" alt="" className="w-6 h-6 flex-shrink-0" />
                <div>
                  <div className="text-slate-400 text-xs">Distance</div>
                  <div className="text-white font-bold text-base">
                    {eta.distanceKm} km
                  </div>
                  <div className="text-slate-500 text-xs">
                    ({eta.distanceMiles} mi)
                  </div>
                </div>
              </div>
            )}
            <div className="flex items-center gap-2 bg-slate-900/50 rounded-lg p-2">
              <img src="/location.gif" alt="" className="w-6 h-6 flex-shrink-0" />
              <div>
                <div className="text-slate-400 text-xs">Tracking</div>
                <div className="text-white font-bold text-base flex items-center gap-1">
                  <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
                  <span>Live</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Route Progress Bar with Shuttle Icon - Similar to DFW Airport Express */}
      {status === 'accepted' && driverLoc && (
        <div className="px-3 sm:px-4 pb-3 sm:pb-4 bg-slate-800/30">
          <div className="space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-slate-400 mb-2">
              <span className="flex items-center gap-1 text-cyan-400">
                <span className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></span>
                <span>Live Tracking</span>
              </span>
            </div>
            {/* Route visualization - Similar to DFW Airport Express */}
            {/* Shows shuttle's progress from hotel (start) to guest location (pickup point) */}
            {/* Progress represents how close shuttle is to guest */}
            <div className="relative h-7 bg-slate-700 rounded-full overflow-visible mx-2">
              {/* Progress bar - shows how far shuttle has traveled toward guest */}
              <div 
                className={`h-full bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-600 rounded-full transition-all duration-1000 ease-out ${
                  progressPercent > 20 ? 'shadow-lg shadow-blue-500/50' : ''
                }`}
                style={{ width: `${progressPercent}%` }}
              >
              </div>
              
              {/* Shuttle icon marker - moves along the progress bar (like DFW Express) */}
              {progressPercent > 10 && (
                <div 
                  className="absolute top-1/2 -translate-y-1/2 transition-all duration-1000 ease-out z-10"
                  style={{ left: `calc(${Math.min(progressPercent, 95)}% - 18px)` }}
                >
                  <div className="bg-white rounded-full p-2.5 shadow-2xl border-3 border-blue-500 transform transition-transform">
                    <span className="text-lg block">🚐</span>
                  </div>
                </div>
              )}
              
              {/* Start Point - Hotel (left side) */}
              <div className="absolute -top-3 -left-4 w-10 h-10 bg-green-500 rounded-full flex items-center justify-center shadow-xl border-[3px] border-white z-10">
                <span className="text-base">🏨</span>
              </div>
              
              {/* End Point - Guest Location (right side, pickup point) */}
              <div className="absolute -top-3 -right-4 w-10 h-10 bg-amber-500 rounded-full flex items-center justify-center shadow-xl border-[3px] border-white z-10">
                <span className="text-base">📍</span>
              </div>
            </div>
            
            {/* Route labels */}
            <div className="flex justify-between text-xs mt-3 px-2 sm:px-4">
              <div className="flex flex-col items-center gap-1">
                <div className="w-3 h-3 bg-green-500 rounded-full shadow-md"></div>
                <span className="text-slate-400 font-medium text-[10px] sm:text-xs text-center">Hotel</span>
                <span className="text-slate-500 text-[9px]">(Start)</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <div className="w-3 h-3 bg-amber-500 rounded-full shadow-md"></div>
                <span className="text-slate-400 font-medium text-[10px] sm:text-xs text-center">Your Location</span>
                <span className="text-slate-500 text-[9px]">(Pickup)</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
