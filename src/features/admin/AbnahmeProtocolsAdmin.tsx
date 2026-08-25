import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ChevronDown, ChevronUp, Download, Loader2 } from 'lucide-react';
import {
  abnahmePdfUrl,
  fetchAbnahmeProtocols,
  type AbnahmeProtocol,
} from '../../lib/data.ts';

/**
 * Die eingegangenen Abnahmeprotokolle.
 *
 * Bewusst eine durchgehende Liste statt einer Wochennavigation wie bei den
 * Wochenberichten: Eine Abnahme hängt an keiner Kalenderwoche, gesucht wird
 * nach Baustelle, und das jüngste Protokoll ist fast immer das gesuchte.
 *
 * Die PDF wird nicht neu erzeugt, sondern ist die Datei, die der Kunde
 * unterschrieben hat. Die Felder hier daneben sind nur zum Ansehen — die
 * Fotos der Mängel stecken ausschließlich in der PDF.
 */
export default function AbnahmeProtocolsAdmin() {
  const [protocols, setProtocols] = useState<AbnahmeProtocol[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Id des Protokolls, dessen Einzelheiten aufgeklappt sind. */
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProtocols(await fetchAbnahmeProtocols());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const download = async (protocol: AbnahmeProtocol) => {
    setBusyId(protocol.id);
    setError(null);
    try {
      // Der Bucket ist privat; die Adresse gilt nur für kurze Zeit.
      const url = await abnahmePdfUrl(protocol.pdf_path);
      window.open(url, '_blank', 'noopener');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="space-y-4">
      <h3 className="text-lg font-bold flex items-center gap-2">
        Abnahmeprotokolle
        {loading && <Loader2 size={16} className="animate-spin text-brand-accent1" />}
      </h3>

      <div className="bg-white rounded-3xl shadow-sm border border-[#141414]/5 overflow-hidden">
        {error && (
          <p className="m-4 text-sm text-red-600 bg-red-50/60 border border-red-100 rounded-xl p-3">
            {error}
          </p>
        )}

        {protocols.map((protocol) => {
          const open = openId === protocol.id;
          return (
            <div key={protocol.id} className="border-b border-[#141414]/5 last:border-none">
              <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-gray-900 truncate">
                    {protocol.site_number && (
                      <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-xs font-mono mr-2">
                        {protocol.site_number}
                      </span>
                    )}
                    {protocol.site_address || 'Ohne Adresse'}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {format(new Date(protocol.created_at), 'dd.MM.yyyy HH:mm')} ·{' '}
                    {protocol.employees?.first_name} {protocol.employees?.last_name}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={
                      protocol.status === 'ohne'
                        ? 'px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-800'
                        : 'px-2.5 py-1 rounded-lg text-xs font-bold bg-red-50 text-red-800'
                    }
                  >
                    {protocol.status === 'ohne' ? 'Ohne Mängel' : 'Mit Mängeln'}
                  </span>
                  <button
                    onClick={() => setOpenId(open ? null : protocol.id)}
                    className="flex items-center gap-1.5 bg-gray-100 text-gray-700 px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-gray-200 cursor-pointer"
                  >
                    {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />} Details
                  </button>
                  <button
                    onClick={() => download(protocol)}
                    disabled={busyId === protocol.id}
                    className="flex items-center gap-1.5 bg-brand-accent1 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-brand-accent1/90 disabled:opacity-60 cursor-pointer"
                  >
                    <Download size={16} /> PDF
                  </button>
                </div>
              </div>

              {open && (
                <div className="px-4 pb-4 -mt-1 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs font-semibold text-[#141414]/40 uppercase">
                        Art der Abnahme
                      </p>
                      <p className="text-sm text-gray-800">
                        {protocol.type === 'teil' ? 'Teilabnahme' : 'Gesamtabnahme'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-[#141414]/40 uppercase">Teilnehmer</p>
                      <p className="text-sm text-gray-800">
                        {protocol.participants.length > 0
                          ? protocol.participants.join(', ')
                          : '—'}
                      </p>
                    </div>
                  </div>

                  {protocol.status === 'mit' && (
                    <div>
                      <p className="text-xs font-semibold text-[#141414]/40 uppercase">
                        Nacharbeiten bis
                      </p>
                      <p className="text-sm text-gray-800 mb-3">
                        {protocol.rework_due
                          ? format(new Date(`${protocol.rework_due}T00:00:00`), 'dd.MM.yyyy')
                          : 'Termin wird noch festgelegt'}
                      </p>
                      <p className="text-xs font-semibold text-[#141414]/40 uppercase pb-1">
                        Mängel / Restarbeiten
                      </p>
                      {protocol.defects.length > 0 ? (
                        <ul className="space-y-1">
                          {protocol.defects.map((defect, i) => (
                            <li key={i} className="text-sm text-gray-700 flex gap-2">
                              <span className="text-brand-accent1 font-bold">•</span>
                              {defect}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-gray-400 italic">Keine Einträge</p>
                      )}
                      <p className="text-xs text-gray-400 mt-2">
                        Fotos zu den Mängeln stehen in der PDF.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {!loading && protocols.length === 0 && (
          <div className="p-8 text-center text-[#141414]/30 text-sm">
            Noch keine Abnahmeprotokolle.
          </div>
        )}
      </div>
    </section>
  );
}
