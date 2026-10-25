import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

import {
    fetchJSON,
    renderProjects
} from '../global.js';


// --------------------------------------------------
// Load projects
// --------------------------------------------------

const projects = await fetchJSON('../lib/projects.json');

const projectsContainer = document.querySelector('.projects');

const projectsTitle = document.querySelector('.projects-title');

projectsTitle.textContent = `${projects.length} Projects`;


// --------------------------------------------------
// Filter state
// --------------------------------------------------

let query = '';
let selectedYear = null;


// --------------------------------------------------
// Get projects that match the search
// --------------------------------------------------

function getSearchFilteredProjects() {
    return projects.filter((project) => {
        let values = Object.values(project)
            .join('\n')
            .toLowerCase();

        return values.includes(query.toLowerCase());
    });
}


// --------------------------------------------------
// Apply BOTH search + year filters
// --------------------------------------------------

function updateProjects() {

    let filteredProjects = getSearchFilteredProjects();

    if (selectedYear !== null) {
        filteredProjects = filteredProjects.filter(
            (project) => project.year === selectedYear
        );
    }

    renderProjects(
        filteredProjects,
        projectsContainer,
        'h2'
    );
}


// --------------------------------------------------
// Render pie chart
// --------------------------------------------------

function renderPieChart(projectsGiven) {

    let rolledData = d3.rollups(
        projectsGiven,
        (v) => v.length,
        (d) => d.year,
    );

    let data = rolledData.map(([year, count]) => {
        return {
            value: count,
            label: year
        };
    });

    let arcGenerator = d3.arc()
        .innerRadius(0)
        .outerRadius(50);

    let sliceGenerator = d3.pie()
        .value((d) => d.value);

    let arcData = sliceGenerator(data);

    let arcs = arcData.map(
        (d) => arcGenerator(d)
    );

    let colors = d3.scaleOrdinal(
        d3.schemeTableau10
    );


    // --------------------------------------------------
    // Clear old pie chart
    // --------------------------------------------------

    let svg = d3.select('#projects-pie-plot');

    svg.selectAll('path').remove();


    // --------------------------------------------------
    // Clear old legend
    // --------------------------------------------------

    let legend = d3.select('.legend');

    legend.selectAll('li').remove();


    // --------------------------------------------------
    // Draw pie slices
    // --------------------------------------------------

    arcs.forEach((arc, i) => {

        let year = data[i].label;

        svg
            .append('path')
            .attr('d', arc)
            .attr('fill', colors(i))
            .attr(
                'class',
                year === selectedYear
                    ? 'selected'
                    : ''
            )
            .on('click', () => {

                // Clicking selected year again deselects it
                if (selectedYear === year) {
                    selectedYear = null;
                } else {
                    selectedYear = year;
                }

                // Update highlighting
                svg
                    .selectAll('path')
                    .attr('class', (_, idx) =>
                        data[idx].label === selectedYear
                            ? 'selected'
                            : ''
                    );

                legend
                    .selectAll('li')
                    .attr('class', (_, idx) =>
                        data[idx].label === selectedYear
                            ? 'legend-item selected'
                            : 'legend-item'
                    );

                // Apply BOTH filters
                updateProjects();
            });
    });


    // --------------------------------------------------
    // Create legend
    // --------------------------------------------------

    data.forEach((d, idx) => {

        legend
            .append('li')
            .attr(
                'class',
                d.label === selectedYear
                    ? 'legend-item selected'
                    : 'legend-item'
            )
            .attr(
                'style',
                `--color:${colors(idx)}`
            )
            .html(`
                <span class="swatch"></span>
                ${d.label} <em>(${d.value})</em>
            `);
    });
}


// --------------------------------------------------
// Initial page render
// --------------------------------------------------

updateProjects();

renderPieChart(projects);


// --------------------------------------------------
// Search
// --------------------------------------------------

let searchInput =
    document.querySelector('.searchBar');

searchInput.addEventListener('input', (event) => {

    query = event.target.value;

    // Get projects matching search
    let searchFilteredProjects =
        getSearchFilteredProjects();

    // If selected year disappears from search results,
    // remove the year selection
    if (selectedYear !== null) {

        let yearStillExists =
            searchFilteredProjects.some(
                (project) =>
                    project.year === selectedYear
            );

        if (!yearStillExists) {
            selectedYear = null;
        }
    }

    // Update project cards using BOTH filters
    updateProjects();

    // Chart represents projects matching the search
    renderPieChart(searchFilteredProjects);
});