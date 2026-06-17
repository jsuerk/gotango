/**
 * Minimal deterministic fixture for GoTango Score v2 unit tests.
 * Provenance: derived from corrected backtest patterns; not used in production runtime.
 */
export const MINIMAL_FIXTURE = {
  publicDestinations: [
    { id: 'alpha', name: 'Alpha' },
    { id: 'beta', name: 'Beta' },
  ],
  latestPayload: {
    saved_at: '2026-06-05T14:00:00.000Z',
    destinations: [
      {
        id: 'alpha',
        raw_ga_arrivals_24h: 20,
        weighted_private_signal_24h: 15,
        signal_score: 60,
        arrival_count_truncated: false,
      },
      {
        id: 'beta',
        raw_ga_arrivals_24h: 8,
        weighted_private_signal_24h: 6,
        signal_score: 30,
        arrival_count_truncated: false,
      },
    ],
  },
  historyList: [
    {
      history_version: 'ga_filtered_v2',
      saved_at: '2026-06-03T14:00:00.000Z',
      per_destination: [
        {
          id: 'alpha',
          date: '2026-06-03',
          saved_at: '2026-06-03T14:00:00.000Z',
          raw_ga_arrivals_24h: 10,
          weighted_private_signal_24h: 8,
          signal_score: 40,
          arrival_count_truncated: false,
        },
        {
          id: 'beta',
          date: '2026-06-03',
          saved_at: '2026-06-03T14:00:00.000Z',
          raw_ga_arrivals_24h: 5,
          weighted_private_signal_24h: 4,
          signal_score: 20,
          arrival_count_truncated: false,
        },
      ],
    },
    {
      history_version: 'ga_filtered_v2',
      saved_at: '2026-06-04T14:00:00.000Z',
      per_destination: [
        {
          id: 'alpha',
          date: '2026-06-04',
          saved_at: '2026-06-04T14:00:00.000Z',
          raw_ga_arrivals_24h: 12,
          weighted_private_signal_24h: 10,
          signal_score: 45,
          arrival_count_truncated: false,
        },
        {
          id: 'beta',
          date: '2026-06-04',
          saved_at: '2026-06-04T14:00:00.000Z',
          raw_ga_arrivals_24h: 6,
          weighted_private_signal_24h: 5,
          signal_score: 25,
          arrival_count_truncated: false,
        },
      ],
    },
    {
      history_version: 'ga_filtered_v2',
      saved_at: '2026-06-05T14:00:00.000Z',
      per_destination: [
        {
          id: 'alpha',
          date: '2026-06-05',
          saved_at: '2026-06-05T12:00:00.000Z',
          raw_ga_arrivals_24h: 11,
          weighted_private_signal_24h: 9,
          signal_score: 42,
          arrival_count_truncated: false,
        },
      ],
    },
  ],
};
