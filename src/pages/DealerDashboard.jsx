import DashboardLayout from '../components/layout/DashboardLayout';
import NewsHighlightCard from '../components/dealer/NewsHighlightCard';
import PlafondTopUp from '../components/dealer/PlafondTopUp';
import RecentActivations from '../components/dealer/RecentActivations';
import RecentOrders from '../components/dealer/RecentOrders';
import Objectives from '../components/dealer/Objectives';
import AndamentoMensile from '../components/dealer/AndamentoMensile';
import PerformanceSettimanale from '../components/dealer/PerformanceSettimanale';
import InArrivo from '../components/dealer/InArrivo';
import CompensiRealtimeWide from '../components/dealer/CompensiRealtimeWide';
import EniPromoToast from '../components/dealer/EniPromoToast';

import { useAuth } from '../contexts/AuthContext';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export default function DealerDashboard() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [plafondKey, setPlafondKey] = useState(0);
  useEffect(() => {
    const onUpdated = () => setPlafondKey(k => k + 1);
    window.addEventListener('plafond-updated', onUpdated);
    return () => window.removeEventListener('plafond-updated', onUpdated);
  }, []);
  // Se arriviamo con state { openTopUp: true } apri la modale globale
  useEffect(() => {
    if (location?.state && location.state.openTopUp) {
      try { window.dispatchEvent(new Event('open-plafond-topup')); } catch {}
      // Pulisci lo state per evitare riaperture al refresh
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location, navigate]);
  const dealerIdFromToken = user?.dealerId || user?.idDealer || null;

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* Top Row: 3 card della stessa altezza - Performance, News, Compensi */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Performance Settimanale (occupava la card vuota) */}
          <div>
            <PerformanceSettimanale key={plafondKey} />
          </div>

          {/* Card News */}
          <div>
            <NewsHighlightCard dealerId={dealerIdFromToken} />
          </div>

          {/* Card Compensi */}
          <div>
            <CompensiRealtimeWide />
          </div>
        </div>

        {/* Sezioni principali */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* Ultime Attivazioni */}
          <RecentActivations />
          
          {/* Ultimi Ordini */}
          <RecentOrders />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <Objectives />
          <AndamentoMensile />
        </div>

        {/* Modale ricarica plafond */}
        <PlafondTopUp />
        
        {/* Toast promozionale ENI Plenitude */}
        <EniPromoToast />
      </div>
    </DashboardLayout>
  );
}
