import { Link } from 'react-router-dom'
import { Film, CalendarDays, ArrowRight } from 'lucide-react'
import { format } from 'date-fns'

const features = [
  {
    to: '/videos',
    icon: Film,
    label: 'Video Review',
    description: 'Upload a Google Drive video, leave timestamped comments, and give precise feedback.',
    color: '#6C63FF',
  },
  {
    to: '/calendar',
    icon: CalendarDays,
    label: 'Content Calendar',
    description: 'Schedule shoot days, edit sessions, reviews, and deliveries on a monthly view.',
    color: '#10b981',
  },
]

export default function Home() {
  return (
    <div className="p-8 max-w-3xl">
      {/* Header */}
      <div className="mb-8">
        <p className="text-sm text-text-muted mb-1">{format(new Date(), 'EEEE, MMMM d')}</p>
        <h1 className="text-2xl font-bold text-text-primary">Welcome to C4 Lab</h1>
        <p className="text-text-secondary mt-1">Your creative workflow hub — review, plan, deliver.</p>
      </div>

      {/* Feature cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {features.map(({ to, icon: Icon, label, description, color }) => (
          <Link
            key={to}
            to={to}
            className="card p-5 hover:shadow-md transition-shadow group flex flex-col gap-3"
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: color + '18' }}
            >
              <Icon size={20} style={{ color }} />
            </div>
            <div className="flex-1">
              <h2 className="text-sm font-semibold text-text-primary mb-1">{label}</h2>
              <p className="text-sm text-text-secondary leading-relaxed">{description}</p>
            </div>
            <div className="flex items-center gap-1 text-xs font-medium" style={{ color }}>
              Open <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
