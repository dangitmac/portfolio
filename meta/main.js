import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

import scrollama from 'https://cdn.jsdelivr.net/npm/scrollama@3.2.0/+esm';

let xScale;
let visibleCommits = [];
let yScale;

async function loadData() {
    const data = await d3.csv('loc.csv', (row) => ({
        ...row,
        line: Number(row.line),
        depth: Number(row.depth),
        length: Number(row.length),
        date: new Date(row.date + 'T00:00' + row.timezone),
        datetime: new Date(row.datetime),
    }));

    return data;
}

function processCommits(data) {
    return d3
        .groups(data, (d) => d.commit)
        .map(([commit, lines]) => {
            let first = lines[0];

            let {
                author,
                date,
                time,
                timezone,
                datetime
            } = first;

            let ret = {
                id: commit,
                url: `https://github.com/dangitmac/portfolio/commit/${commit}`,
                author,
                date,
                time,
                timezone,
                datetime,
                hourFrac:
                    datetime.getHours() +
                    datetime.getMinutes() / 60,
                totalLines: lines.length,
            };

            Object.defineProperty(ret, 'lines', {
                value: lines,
                enumerable: false,
                writable: false,
                configurable: false,
            });

            return ret;
        });
}

function renderCommitInfo(data, commits) {
    const numberOfFiles = d3.group(data, d => d.file).size;
    const maxDepth = d3.max(data, d => d.depth);
    const averageLineLength = d3.mean(data, d => d.length);

    const fileLengths = d3.rollups(
        data,
        v => d3.max(v, d => d.line),
        d => d.file
    );

    const longestFile = d3.greatest(
        fileLengths,
        d => d[1]
    );

    const stats = [
        {
            label: 'Total LOC',
            value: data.length
        },
        {
            label: 'Total commits',
            value: commits.length
        },
        {
            label: 'Number of files',
            value: numberOfFiles
        },
        {
            label: 'Max depth',
            value: maxDepth
        },
        {
            label: 'Average line length',
            value: averageLineLength.toFixed(1)
        },
        {
            label: 'Longest file',
            value: `${longestFile[0]} (${longestFile[1]} lines)`
        }
    ];

    const container = d3
        .select('#stats')
        .html('')
        .attr('class', 'stats-grid');

    container
        .selectAll('.stat-card')
        .data(stats)
        .join('div')
        .attr('class', 'stat-card')
        .html(
            d => `
                <div class="stat-label">${d.label}</div>
                <div class="stat-value">${d.value}</div>
            `
        );
}

function renderTooltipContent(commit) {
    const link = document.getElementById('commit-link');
    const date = document.getElementById('commit-date');
    const time = document.getElementById('commit-time');
    const author = document.getElementById('commit-author');
    const lines = document.getElementById('commit-lines');

    if (!commit || Object.keys(commit).length === 0) {
        return;
    }

    link.href = commit.url;
    link.textContent = commit.id;

    date.textContent = commit.datetime?.toLocaleString('en', {
        dateStyle: 'full',
    });

    time.textContent = commit.datetime?.toLocaleString('en', {
        timeStyle: 'short',
    });

    author.textContent = commit.author;

    lines.textContent = commit.totalLines;
}

function updateTooltipVisibility(isVisible) {
    const tooltip = document.getElementById('commit-tooltip');
    tooltip.hidden = !isVisible;
}

function updateTooltipPosition(event) {
    const tooltip = document.getElementById('commit-tooltip');

    tooltip.style.left = `${event.clientX + 10}px`;
    tooltip.style.top = `${event.clientY + 10}px`;
}

function isCommitSelected(selection, commit) {
    if (!selection) {
        return false;
    }

    const [[x0, y0], [x1, y1]] = selection;

    const x = xScale(commit.datetime);
    const y = yScale(commit.hourFrac);

    return (
        x >= x0 &&
        x <= x1 &&
        y >= y0 &&
        y <= y1
    );
}

function renderSelectionCount(selection) {
    const selectedCommits = selection
        ? visibleCommits.filter((d) =>
            isCommitSelected(selection, d)
        )
        : [];

    const countElement =
        document.querySelector('#selection-count');

    countElement.textContent = `${
        selectedCommits.length || 'No'
    } commits selected`;

    return selectedCommits;
}

function renderLanguageBreakdown(selection) {
    const selectedCommits = selection
        ? visibleCommits.filter((d) =>
            isCommitSelected(selection, d)
        )
        : [];

    const container =
        document.getElementById('language-breakdown');

    if (selectedCommits.length === 0) {
        container.innerHTML = '';
        return;
    }

    const lines = selectedCommits.flatMap(
        (d) => d.lines
    );

    const breakdown = d3.rollup(
        lines,
        (v) => v.length,
        (d) => d.type
    );

    container.innerHTML = '';

    for (const [language, count] of breakdown) {
        const proportion = count / lines.length;
        const formatted = d3.format('.1%')(proportion);

        const item = document.createElement('div');
        item.className = 'language-item';

        item.innerHTML = `
            <dt>${language.toUpperCase()}</dt>
            <dd>
                ${count} lines
                <span>(${formatted})</span>
            </dd>
        `;

        container.appendChild(item);
    }
}

function brushed(event) {
    const selection = event.selection;

    d3
        .selectAll('.dots circle')
        .classed(
            'selected',
            (commit) =>
                isCommitSelected(selection, commit)
        );

    renderSelectionCount(selection);
    renderLanguageBreakdown(selection);
}

function brushSelector() {
    const svg = d3.select(document.querySelector('#chart svg'));

    svg.call(
        d3
            .brush()
            .on('start brush end', brushed)
    );

    svg
        .selectAll('.dots, .overlay ~ *')
        .raise();
}

function createScatterPlot(commits) {
    const width = 1000;
    const height = 600;
    const margin = {
        top: 28,
        right: 36,
        bottom: 36,
        left: 46
    };

    const usableArea = {
        top: margin.top,
        right: width - margin.right,
        bottom: height - margin.bottom,
        left: margin.left,
        width: width - margin.left - margin.right,
        height: height - margin.top - margin.bottom,
    };

    const svg = d3
        .select('#chart')
        .append('svg')
        .attr('viewBox', `0 0 ${width} ${height}`)
        .attr('role', 'img')
        .attr('aria-label', 'Commit dates and times of day. Larger circles represent more lines.')
        .style('overflow', 'visible');

    xScale = d3
        .scaleTime()
        .domain(d3.extent(commits, (d) => d.datetime))
        .range([0, width])
        .nice();

    xScale.range([
        usableArea.left,
        usableArea.right
    ]);

    yScale = d3
        .scaleLinear()
        .domain([0, 24])
        .range([height, 0]);

    const maxLines = d3.max(commits, (d) => d.totalLines);

    const rScale = d3
        .scaleSqrt()
        .domain([0, maxLines])
        .range([3, 27]);

    yScale.range([
        usableArea.bottom,
        usableArea.top
    ]);

    const xAxis = d3
        .axisBottom(xScale)
        .ticks(5)
        .tickFormat(d3.timeFormat('%b %d'));

    const yAxis = d3
        .axisLeft(yScale)
        .tickFormat(
            (d) =>
                String(d % 24).padStart(2, '0') + ':00'
        );

    svg
        .append('g')
        .attr(
            'transform',
            `translate(0, ${usableArea.bottom})`
        )
        .call(xAxis);

    svg
        .append('g')
        .attr(
            'transform',
            `translate(${usableArea.left}, 0)`
        )
        .call(yAxis);

    const gridlines = d3
        .axisLeft(yScale)
        .tickSize(-usableArea.width)
        .tickFormat('');

    svg
        .append('g')
        .attr('class', 'gridlines')
        .attr(
            'transform',
            `translate(${usableArea.left}, 0)`
        )
        .call(gridlines);

    const dots = svg
        .append('g')
        .attr('class', 'dots');

    return function updateScatterPlot(subset) {
        const sortedCommits = d3.sort(subset, (d) => -d.totalLines);
        const latest = subset.at(-1);
        updateTooltipVisibility(false);
        dots
            .selectAll('circle')
            .data(sortedCommits, (d) => d.id)
            .join('circle')
            .attr('cx', (d) => xScale(d.datetime))
            .attr('cy', (d) => yScale(d.hourFrac))
            .attr('r', (d) => rScale(d.totalLines))
            .style('--radius', (d) => `${rScale(d.totalLines)}px`)
            .classed('latest-commit', (d) => d.id === latest?.id)
            .attr('fill', (d) => d.id === latest?.id ? '#b45309' : '#24788b')
            .style('fill-opacity', 0.7)
            .on('mouseenter', (event, commit) => {
                d3.select(event.currentTarget)
                    .style('fill-opacity', 1);

                renderTooltipContent(commit);
                updateTooltipVisibility(true);
                updateTooltipPosition(event);
            })
            .on('mousemove', (event) => {
                updateTooltipPosition(event);
            })
            .on('mouseleave', (event) => {
                d3.select(event.currentTarget)
                    .style('fill-opacity', 0.7);

                updateTooltipVisibility(false);
            });
        brushed({ selection: d3.brushSelection(svg.node()) });
    };
}

function createFileDisplay(data) {
    const languages = Array.from(new Set(data.map((line) => line.type))).sort();
    const color = d3.scaleOrdinal(languages, d3.schemeTableau10);
    const legend = d3.select('#file-legend').selectAll('li').data(languages).join('li');
    legend.append('span').attr('class', 'file-key').style('--line-color', color);
    legend.append('span').text((language) => language.toUpperCase());

    return function renderFiles(lines) {
        const files = d3.groups(lines, (line) => line.file)
            .map(([name, rows]) => ({ name, rows }))
            .sort((a, b) => b.rows.length - a.rows.length || d3.ascending(a.name, b.name));
        const entries = d3.select('#files').selectAll('div.file-row')
            .data(files, (file) => file.name).join((enter) => {
                const rows = enter.append('div').attr('class', 'file-row');
                const labels = rows.append('dt');
                labels.append('code');
                labels.append('small');
                rows.append('dd').attr('aria-hidden', 'true');
                return rows;
            });
        entries.select('code').text((file) => file.name);
        entries.select('small').text((file) => `${file.rows.length} lines`);
        entries.select('dd').selectAll('.loc').data((file) => file.rows, (line) => line.line)
            .join('span').attr('class', 'loc').style('--line-color', (line) => color(line.type));
    };
}

function renderStory(commits) {
    const dates = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' });
    const story = d3.select('#scatter-story').selectAll('article')
        .data(commits, (commit) => commit.id).join('article').attr('class', 'step');
    story.append('time').attr('datetime', (commit) => commit.datetime.toISOString())
        .text((commit) => dates.format(commit.datetime));
    story.append('h3').text((commit, index) => {
        if (index === 0) return 'The first lines';
        if (index === commits.length - 1) return 'The latest changes';
        const files = d3.rollups(commit.lines, (lines) => lines.length, (line) => line.file);
        return 'Updating ' + d3.greatest(files, (file) => file[1])[0];
    });
    story.append('p').text((commit) => {
        const count = new Set(commit.lines.map((line) => line.file)).size;
        return `${commit.totalLines} lines in the snapshot trace back to this commit across ${count} ${count === 1 ? 'file' : 'files'}.`;
    });
    story.append('a').attr('href', (commit) => commit.url)
        .text((commit) => 'View commit ' + commit.id);
}

const data = await loadData();
const commits = processCommits(data).sort((a, b) => a.datetime - b.datetime);
const slider = document.querySelector('#commit-progress');
const cutoff = document.querySelector('#commit-cutoff');
const visibleCount = document.querySelector('#visible-commits');

if (commits.length === 0) {
    slider.disabled = true;
    visibleCount.textContent = 'No commit data available.';
} else {
    const timeline = d3.scaleTime().domain(d3.extent(commits, (commit) => commit.datetime)).range([0, 100]);
    const updateScatterPlot = createScatterPlot(commits);
    const formatCutoff = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' });
    renderCommitInfo(data, commits);
    const renderFiles = createFileDisplay(data);
    renderStory(commits);
    brushSelector();

    function showThrough(date) {
        visibleCommits = commits.filter((commit) => commit.datetime <= date);
        const latest = visibleCommits.at(-1);
        cutoff.dateTime = date.toISOString();
        cutoff.textContent = formatCutoff.format(date);
        slider.value = timeline(date);
        slider.setAttribute('aria-valuetext', cutoff.textContent);
        visibleCount.textContent = `${visibleCommits.length} of ${commits.length} commits shown`;
        d3.selectAll('#scatter-story .step')
            .classed('is-active', (commit) => commit.id === latest?.id)
            .attr('aria-current', (commit) => commit.id === latest?.id ? 'step' : null);
        updateScatterPlot(visibleCommits);
        renderFiles(visibleCommits.flatMap((commit) => commit.lines));
    }

    showThrough(commits[0].datetime);
    slider.addEventListener('input', () => showThrough(timeline.invert(Number(slider.value))));
    scrollama().setup({ step: '#scatter-story .step', offset: 0.68 })
        .onStepEnter(({ element }) => showThrough(d3.select(element).datum().datetime));
}
