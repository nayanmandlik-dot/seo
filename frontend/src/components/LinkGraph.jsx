import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

// Force-directed graph; node size = inbound count, color = score (red/orange/green).
export default function LinkGraph({ nodes, links, scoreByUrl, onSelect }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current || !nodes?.length) return;
    const svg = d3.select(ref.current);
    svg.selectAll('*').remove();
    const width = ref.current.clientWidth;
    const height = 600;

    const g = svg.append('g');

    const sizeOf = (n) => 4 + Math.sqrt((n.inbound || 0) + 1) * 3;
    const colorOf = (n) => {
      const s = scoreByUrl?.[n.id] ?? 100;
      return s >= 70 ? '#16a34a' : s >= 40 ? '#d97706' : '#dc2626';
    };

    const nodeData = nodes.map(n => ({ ...n }));
    const linkData = links
      .filter(l => nodeData.find(n => n.id === l.source) && nodeData.find(n => n.id === l.target))
      .map(l => ({ ...l }));

    const sim = d3.forceSimulation(nodeData)
      .force('link', d3.forceLink(linkData).id(d => d.id).distance(60))
      .force('charge', d3.forceManyBody().strength(-120))
      .force('center', d3.forceCenter(width / 2, height / 2));

    const link = g.append('g').attr('stroke', '#cbd5e1').attr('stroke-width', 0.6)
      .selectAll('line').data(linkData).enter().append('line');

    const node = g.append('g').selectAll('circle').data(nodeData).enter().append('circle')
      .attr('r', sizeOf).attr('fill', colorOf).attr('stroke', '#fff').attr('stroke-width', 1)
      .call(d3.drag()
        .on('start', (event, d) => { if (!event.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
        .on('end', (event, d) => { if (!event.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }))
      .on('click', (_, d) => onSelect?.(d));

    node.append('title').text(d => `${d.id}\nIn: ${d.inbound} • Out: ${d.outbound}`);

    sim.on('tick', () => {
      link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
      node.attr('cx', d => d.x).attr('cy', d => d.y);
    });

    const zoom = d3.zoom().scaleExtent([0.1, 4]).on('zoom', (e) => g.attr('transform', e.transform));
    svg.call(zoom);

    return () => { sim.stop(); };
  }, [nodes, links, scoreByUrl, onSelect]);

  return <svg ref={ref} className="w-full bg-white border border-gray-200 rounded-lg" height={600} />;
}
