import type { Job, JobSource } from '../models';
import type { JobsPort } from '../ports';

export class JobService {
  constructor(private readonly port: JobsPort) {}

  getJob(id: string): Promise<Job | null> {
    return this.port.getJob(id);
  }

  getSources(jobId: string): Promise<JobSource[]> {
    return this.port.getSources(jobId);
  }
}
