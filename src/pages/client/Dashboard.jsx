import { Link } from 'react-router-dom'
import { CalendarDays, PenLine, Upload, ChevronRight } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { format } from 'date-fns'

const ACTIONS = [
  {
    to: '/client/calendar',
    icon: CalendarDays,
    label: 'Content Calendar',
    desc: 'Review your scheduled content, leave feedback, and approve posts.',
    color: '#6C63FF',
  },
  {
    to: '/client/request',
    icon: PenLine,
    label: 'Request a Post',
    desc: 'Submit a new content idea with platform, priority, and inspiration.',
    color: '#10b981',
  },
  {
    to: '/client/upload',
    icon: Upload,
    label: 'Upload Footage',
    desc: 'Drop raw footage for your team to edit.',
    color: '#f59e0b',
  },
]

export default function ClientDashboard() {
  const { profile } = useAuth()

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-10">
        <p className="text-sm text-text-muted">{format(new Date(), 'EEEE, MMMM d')}</p>
        <h1 className="text-2xl font-bold text-text-primary mt-0.5">
          Welcome back, {profile?.full_name?.split(' ')[0] || 'there'}
        </h1>
        <p className="text-text-secondary mt-1">What would you like to do today?</p>
      </div>

      <div className="grid gap-4">
        {ACTIONS.map(({ to, icon: Icon, label, desc, color }) => (
          <Link
            key={to}
            to={to}
            className="card p-6 flex items-center gap-5 hover:shadow-md transition-shadow group"
          >
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: color + '18' }}
            >
              <Icon size={22} style={{ color }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold text-text-primary">{label}</p>
              <p className="text-sm text-text-secondary mt-0.5">{desc}</p>
            </div>
            <ChevronRight
              size={18}
              className="text-text-muted shrink-0 group-hover:translate-x-0.5 transition-transform"
            />
          </Link>
        ))}
      </div>
    </div>
  )
}
