import { NginxChart } from './main';
import { Testing } from 'cdk8s';

describe('Placeholder', () => {
  test('Empty', () => {
    const app = Testing.app();
    const chart = new NginxChart(app, 'nginx-chart');
    const results = Testing.synth(chart)
    expect(results).toMatchSnapshot();
  });
});
