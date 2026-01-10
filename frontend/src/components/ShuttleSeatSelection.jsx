import React, { useState, useEffect } from 'react';

// Shuttle seat layout - Top view similar to the shuttle van
// Based on typical passenger van: 7 rows, 2 seats per row (7 left, 7 right = 14 seats total)
const SEAT_LAYOUT = [
  // Row 1 (Front)
  [{ id: '1A', side: 'left' }, null, { id: '1B', side: 'right' }],
  // Row 2
  [{ id: '2A', side: 'left' }, null, { id: '2B', side: 'right' }],
  // Row 3
  [{ id: '3A', side: 'left' }, null, { id: '3B', side: 'right' }],
  // Row 4
  [{ id: '4A', side: 'left' }, null, { id: '4B', side: 'right' }],
  // Row 5
  [{ id: '5A', side: 'left' }, null, { id: '5B', side: 'right' }],
  // Row 6
  [{ id: '6A', side: 'left' }, null, { id: '6B', side: 'right' }],
  // Row 7
  [{ id: '7A', side: 'left' }, null, { id: '7B', side: 'right' }],
];

export default function ShuttleSeatSelection({ 
  passengerCount, 
  selectedSeats, 
  onSeatChange,
  occupiedSeats = [],
  pendingSeats = [],
  readonly = false 
}) {
  const [localSelections, setLocalSelections] = useState(selectedSeats || []);

  useEffect(() => {
    setLocalSelections(selectedSeats || []);
  }, [selectedSeats]);

  const handleSeatClick = (seatId) => {
    if (readonly) return;
    
    // Don't allow selection of occupied or pending seats
    if (occupiedSeats.includes(seatId) || pendingSeats.includes(seatId)) {
      return;
    }
    
    const seat = localSelections.find(s => s === seatId);
    let newSelections;

    if (seat) {
      // Deselect
      newSelections = localSelections.filter(s => s !== seatId);
    } else {
      // Check if we can select more seats
      if (localSelections.length >= passengerCount) {
        // Replace the first selected seat
        newSelections = [seatId, ...localSelections.slice(1)];
      } else {
        // Add new seat
        newSelections = [...localSelections, seatId];
      }
    }

    setLocalSelections(newSelections);
    if (onSeatChange) {
      onSeatChange(newSelections);
    }
  };

  const getSeatStatus = (seatId) => {
    if (occupiedSeats.includes(seatId)) return 'occupied'; // Booked/Confirmed by other guest
    if (pendingSeats.includes(seatId) && !localSelections.includes(seatId)) return 'pending'; // Selected by other guest (pending)
    if (localSelections.includes(seatId)) return 'selected'; // Selected by current guest
    return 'available';
  };

  const renderSeat = (seat, rowIndex, colIndex) => {
    if (!seat) {
      // Aisle space
      return (
        <div key={`aisle-${rowIndex}`} className="w-12 sm:w-16 flex items-center justify-center">
          <div className="h-0.5 w-full bg-slate-700"></div>
        </div>
      );
    }

    const status = getSeatStatus(seat.id);
    const isOccupied = status === 'occupied';
    const isPending = status === 'pending';
    const isSelected = status === 'selected';

    return (
      <button
        key={seat.id}
        type="button"
        onClick={() => handleSeatClick(seat.id)}
        disabled={isOccupied || isPending || readonly}
        className={`
          w-10 h-10 sm:w-12 sm:h-12 rounded-lg border-2 transition-all transform relative
          ${isOccupied 
            ? 'bg-slate-700 border-slate-600 cursor-not-allowed opacity-60' 
            : isPending
            ? 'bg-amber-500/30 border-amber-500/50 cursor-not-allowed opacity-70'
            : isSelected
            ? 'bg-gradient-to-br from-emerald-400 to-green-500 border-emerald-300 shadow-lg shadow-emerald-500/50 scale-110'
            : 'bg-slate-800 border-slate-600 hover:border-indigo-400 hover:bg-slate-700 cursor-pointer active:scale-95'
          }
          ${readonly ? 'cursor-default' : ''}
        `}
        title={
          isOccupied ? 'Occupied (Booked)' : 
          isPending ? 'Pending (Selected by another guest)' : 
          isSelected ? 'Your Selection' : 
          seat.id
        }
      >
        <div className="text-[10px] sm:text-xs font-bold text-white">
          {seat.id.split(/(\d+)/)[1]}
        </div>
        <div className="text-[8px] text-slate-300">
          {seat.id.split(/(\d+)/)[2]}
        </div>
        {isSelected && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-white text-sm font-bold">✓</span>
          </div>
        )}
        {isOccupied && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-slate-300 text-xs">✕</span>
          </div>
        )}
        {isPending && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-amber-300 text-xs">○</span>
          </div>
        )}
      </button>
    );
  };

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 sm:p-6">
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-bold text-white">🚐 Select Your Seats</h3>
          <div className="text-sm text-slate-400">
            {localSelections.length} / {passengerCount} selected
          </div>
        </div>
        <p className="text-xs text-slate-500">
          Seats will be confirmed when driver accepts your request
        </p>
      </div>

      {/* Shuttle Top View */}
      <div className="relative bg-gradient-to-b from-slate-800 to-slate-900 rounded-xl p-4 sm:p-6 border-2 border-slate-700 mb-4">
        {/* Driver Area */}
        <div className="mb-3 pb-3 border-b border-slate-700">
          <div className="flex items-center justify-center gap-2">
            <div className="w-16 h-12 sm:w-20 sm:h-14 bg-slate-700 rounded-lg border-2 border-slate-600 flex items-center justify-center">
              <span className="text-xs sm:text-sm text-slate-400">🚗 Driver</span>
            </div>
          </div>
        </div>

        {/* Seat Grid */}
        <div className="space-y-2 sm:space-y-3">
          {SEAT_LAYOUT.map((row, rowIndex) => (
            <div 
              key={`row-${rowIndex}`} 
              className="flex items-center justify-center gap-2 sm:gap-3"
            >
              {/* Row Number */}
              <div className="w-6 sm:w-8 text-xs sm:text-sm font-bold text-slate-400">
                {rowIndex + 1}
              </div>
              
              {/* Seats */}
              {row.map((seat, colIndex) => (
                <React.Fragment key={`${rowIndex}-${colIndex}`}>
                  {renderSeat(seat, rowIndex, colIndex)}
                </React.Fragment>
              ))}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="mt-4 pt-4 border-t border-slate-700 flex flex-wrap items-center justify-center gap-3 sm:gap-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded border-2 border-slate-600 bg-slate-800"></div>
            <span className="text-slate-400">Available</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded border-2 border-emerald-300 bg-gradient-to-br from-emerald-400 to-green-500"></div>
            <span className="text-slate-400">Your Selection</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded border-2 border-amber-500/50 bg-amber-500/30"></div>
            <span className="text-slate-400">Pending</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded border-2 border-slate-600 bg-slate-700 opacity-60"></div>
            <span className="text-slate-400">Booked</span>
          </div>
        </div>
      </div>

      {/* Selected Seats Display */}
      {localSelections.length > 0 && (
        <div className="bg-indigo-500/20 border border-indigo-500/50 rounded-lg p-3">
          <div className="text-sm font-semibold text-indigo-200 mb-2">Selected Seats:</div>
          <div className="flex flex-wrap gap-2">
            {localSelections.map(seatId => (
              <div
                key={seatId}
                className="px-3 py-1.5 bg-indigo-600 rounded-full text-white text-sm font-bold"
              >
                {seatId}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Warning if not enough seats */}
      {localSelections.length < passengerCount && (
        <div className="mt-3 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2">
          ⚠️ Please select {passengerCount - localSelections.length} more seat{passengerCount - localSelections.length > 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}
