import DashboardLayout from '../components/layout/DashboardLayout';
import { useAuth } from '../contexts/AuthContext';
import StatsCard from '../components/common/StatsCard';
import RecentActivations from '../components/dealer/RecentActivations';
import RecentOrders from '../components/dealer/RecentOrders';
import Objectives from '../components/dealer/Objectives';
import MonthlyTrend from '../components/dealer/MonthlyTrend';

const sidebarItems = [
  { name: 'Home', icon: '🏠', current: true, href: '/dealer' },
  { name: 'Attivazioni', icon: '⚡', current: false, href: '/dealer/activations' },
  { name: 'Prodotti', icon: '📦', current: false, href: '/dealer/products' },
  { name: 'Upload', icon: '📤', current: false, href: '/dealer/upload' },
  { name: 'Assistenza', icon: '🎧', current: false, href: '/dealer/support' },
  { name: 'Documentazione', icon: '📋', current: false, href: '/dealer/docs' },
  { name: 'Piani Incentivi', icon: '💰', current: false, href: '/dealer/incentives' }
];

export default function DealerDashboard() {
  const { user } = useAuth();

  // Dati mock - da sostituire con API calls
  const stats = [
    { title: 'Attivazioni Oggi', value: '12', change: '+8%', icon: '⚡', trend: 'up' },
    { title: 'Ordini Mese', value: '47', change: '+15%', icon: '📦', trend: 'up' },
    { title: 'Credito Disponibile', value: '€2,450', change: '+5%', icon: '💳', trend: 'up' },
    { title: 'Commissioni', value: '€890', change: '+12%', icon: '💰', trend: 'up' }
  ];

  return (
    <DashboardLayout 
      title="Dashboard Dealer" 
      sidebarItems={sidebarItems}
    >

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8">
        {stats.map((stat, index) => (
          <div key={index} className="animate-fade-in" style={{ animationDelay: `${index * 0.1}s` }}>
            <StatsCard {...stat} />
          </div>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8">
        {/* Left Column - Tables */}
        <div className="xl:col-span-2 space-y-6">
          {/* Recent Activations */}
          <RecentActivations />
          
          {/* Recent Orders */}
          <RecentOrders />
        </div>

        {/* Right Column - Charts & Objectives */}
        <div className="space-y-6">
          {/* Objectives */}
          <Objectives />
          
          {/* Monthly Trend */}
          <MonthlyTrend />
        </div>
      </div>
    </DashboardLayout>
  );
}
