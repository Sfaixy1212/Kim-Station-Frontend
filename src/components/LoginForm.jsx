import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import logo2 from '../Logo/logo2.png';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { login, loading, error, setError } = useAuth();
  const navigate = useNavigate();

  // Pulisci l'errore quando l'utente inizia a digitare
  const handleEmailChange = (e) => {
    setEmail(e.target.value);
    if (error) setError(null);
  };

  const handlePasswordChange = (e) => {
    setPassword(e.target.value);
    if (error) setError(null);
  };

  const normalize = (s) => (s || '').toString().trim().toLowerCase().replace(/[^a-z]/g, '');

  // Login programmatico (usato da impersonate via postMessage)
  const loginWith = async (em, pw) => {
    try {
      const result = await login(em, pw);
      console.log('Login completed:', result);
      const role = normalize(result?.role);
      let target = '/dealer';
      if (role === 'supermaster') target = '/supermaster';
      if (role === 'master') target = '/master';
      else if (role === 'masterprodotti') target = '/masterprodotti';
      else if (role === 'agente' || role === 'agent') target = '/agente';
      else if (role === 'admin') target = '/master';
      navigate(target);
    } catch (err) {
      console.error('Impersonate login failed:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await loginWith(email, password);
  };

  // Ascolta messaggi di impersonate dal parent (modale SuperMaster)
  useEffect(() => {
    // Avvisa il parent che il LoginForm è pronto a ricevere credenziali (ACK)
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'IMPERSONATE_ACK' }, window.location.origin);
      }
    } catch {}

    const handler = (ev) => {
      try {
        if (!ev || ev.origin !== window.location.origin) return;
        const data = ev.data || {};
        if (data.type === 'IMPERSONATE_LOGIN' && data.payload) {
          const { email: em, password: pw } = data.payload;
          if (em && pw) {
            setEmail(em);
            setPassword(pw);
            // Avvia login programmatico
            loginWith(em, pw);
          }
        }
      } catch {}
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  return (
    <div className="h-screen w-full bg-gradient-to-br from-login-bg to-login-bgDark flex items-center justify-center px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-lg">
        {/* Login Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8 space-y-6 animate-fade-in">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="mx-auto mb-1 -mt-6 sm:-mt-7 flex justify-center">
              <img src={logo2} alt="KIM Logo" className="h-40 w-40 object-contain block" />
            </div>
            <h2 className="text-3xl font-semibold text-gray-900">
              Accedi al tuo account
            </h2>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} action="/login" method="post" autoComplete="on" role="form" className="space-y-4">
            {/* Hidden field to help password managers */}
            <input type="hidden" name="form-type" value="login" />
            
            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* Email Field */}
            <div>
              <label htmlFor="email" className="sr-only">Email</label>
              <input
                type="text"
                name="email"
                id="email"
                autoComplete="username email"
                required
                value={email}
                onChange={handleEmailChange}
                placeholder="Email"
                disabled={loading}
                data-lpignore="false"
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-login-bg focus:border-transparent transition-all duration-300 ease-in-out text-gray-900 placeholder-gray-500 disabled:opacity-50"
              />
            </div>

            {/* Password Field */}
            <div className="relative">
              <label htmlFor="password" className="sr-only">Password</label>
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                id="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={handlePasswordChange}
                placeholder="Password"
                disabled={loading}
                data-lpignore="false"
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-login-bg focus:border-transparent transition-all duration-300 ease-in-out text-gray-900 placeholder-gray-500 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                disabled={loading}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors p-1 disabled:opacity-50"
              >
                {showPassword ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              name="submit"
              disabled={loading}
              className="w-full bg-login-bg hover:bg-login-bgDark text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200 transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-login-bg focus:ring-offset-2 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              {loading ? 'Accesso in corso...' : 'Accedi'}
            </button>
          </form>

          {/* Forgot Password */}
          <div className="text-center">
            <a href="/forgot-password" className="text-sm text-gray-500 hover:text-login-bg transition-colors duration-200">
              Password dimenticata?
            </a>
          </div>
        </div>

      </div>
    </div>
  );
}
