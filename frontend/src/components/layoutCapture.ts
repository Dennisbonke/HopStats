export const SAMPLE_CAPACITY = 600;
export const INCIDENT_CAPACITY = 8;
export const INCIDENT_PRE_CONTEXT = 30;
export const INCIDENT_POST_CONTEXT = 60;
export const INCIDENT_SAMPLE_CAPACITY = 150;

export type CapturedSample = {
  t: number;
  source: string;
  anomaly?: boolean;
  [key: string]: unknown;
};

export type CapturedIncident<T extends CapturedSample> = {
  samples: T[];
  complete: boolean;
};

/** Retains a live rolling log plus independent, bounded context around anomalies. */
export class LayoutCapture<T extends CapturedSample> {
  readonly samples: T[] = [];
  readonly incidents: CapturedIncident<T>[] = [];
  private activeIncident: CapturedIncident<T> | null = null;
  private quietSamples = 0;

  append(sample: T) {
    const preceding = this.samples.slice(-INCIDENT_PRE_CONTEXT);
    this.samples.push(sample);
    if (this.samples.length > SAMPLE_CAPACITY) this.samples.shift();

    if (sample.anomaly) {
      if (!this.activeIncident) {
        const incident = {
          samples: [...preceding, sample],
          complete: false,
        };
        this.incidents.push(incident);
        if (this.incidents.length > INCIDENT_CAPACITY) this.incidents.shift();
        this.activeIncident = incident;
      } else {
        this.appendToIncident(sample);
      }
      this.quietSamples = 0;
      return;
    }

    if (!this.activeIncident) return;
    this.appendToIncident(sample);
    this.quietSamples += 1;
    if (this.quietSamples >= INCIDENT_POST_CONTEXT) {
      this.activeIncident.complete = true;
      this.activeIncident = null;
      this.quietSamples = 0;
    }
  }

  hasOpenIncident() {
    return this.activeIncident !== null;
  }

  clear() {
    this.samples.length = 0;
    this.incidents.length = 0;
    this.activeIncident = null;
    this.quietSamples = 0;
  }

  private appendToIncident(sample: T) {
    const incidentSamples = this.activeIncident?.samples;
    if (!incidentSamples || incidentSamples.length >= INCIDENT_SAMPLE_CAPACITY)
      return;
    incidentSamples.push(sample);
  }
}
