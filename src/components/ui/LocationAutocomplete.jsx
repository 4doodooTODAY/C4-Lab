import { useState, useEffect, useRef } from 'react'
import { MapPin, Loader2 } from 'lucide-react'

export default function LocationAutocomplete({ value, onChange, placeholder = 'Address or venue name' }) {
  const [predictions, setPredictions] = useState([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [loading, setLoading] = useState(false)
  const [inputValue, setInputValue] = useState(value || '')
  const autocompleteServiceRef = useRef(null)
  const sessionTokenRef = useRef(null)
  const inputRef = useRef(null)

  // Initialize Google Places service once
  useEffect(() => {
    if (window.google?.maps?.places) {
      autocompleteServiceRef.current = new window.google.maps.places.AutocompleteService()
      sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken()
    }
  }, [])

  // Handle input change
  const handleInputChange = async (e) => {
    const input = e.target.value
    setInputValue(input)
    onChange({ target: { value: input } })

    if (!input.trim()) {
      setPredictions([])
      setShowDropdown(false)
      return
    }

    if (!autocompleteServiceRef.current) {
      console.warn('Google Places Autocomplete not available')
      return
    }

    setLoading(true)
    try {
      const results = await autocompleteServiceRef.current.getPlacePredictions({
        input: input,
        sessionToken: sessionTokenRef.current,
        componentRestrictions: { country: 'us' }, // Restrict to US (customize as needed)
      })

      setPredictions(results.predictions || [])
      setShowDropdown(true)
    } catch (err) {
      console.error('Autocomplete error:', err)
      setPredictions([])
    } finally {
      setLoading(false)
    }
  }

  // Handle selection
  const handleSelectPrediction = (prediction) => {
    setInputValue(prediction.description)
    onChange({ target: { value: prediction.description } })
    setPredictions([])
    setShowDropdown(false)
    // Reset session token for next query
    sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken()
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (inputRef.current && !inputRef.current.contains(e.target)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="relative">
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
          <MapPin size={16} />
        </div>
        <input
          ref={inputRef}
          type="text"
          className="input pl-9"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => inputValue.trim() && predictions.length > 0 && setShowDropdown(true)}
          placeholder={placeholder}
          autoComplete="off"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <Loader2 size={16} className="animate-spin text-text-muted" />
          </div>
        )}
      </div>

      {/* Dropdown */}
      {showDropdown && predictions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-border rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
          {predictions.map((prediction) => (
            <button
              key={prediction.place_id}
              type="button"
              onClick={() => handleSelectPrediction(prediction)}
              className="w-full text-left px-4 py-3 hover:bg-surface-2 border-b border-border last:border-b-0 transition-colors text-sm"
            >
              <div className="flex items-start gap-2.5">
                <MapPin size={14} className="text-text-muted mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-text-primary font-medium">{prediction.main_text}</p>
                  {prediction.secondary_text && (
                    <p className="text-xs text-text-muted">{prediction.secondary_text}</p>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* No API key message */}
      {!autocompleteServiceRef.current && inputValue && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-xs text-yellow-700 z-50">
          Google Places API not configured. Add <code className="bg-yellow-100 px-1 rounded">VITE_GOOGLE_MAPS_API_KEY</code> to .env
        </div>
      )}
    </div>
  )
}
