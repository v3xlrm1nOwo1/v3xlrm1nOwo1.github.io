function scrolll() {
    var left = document.querySelector(".scroll-images");
    left.scrollBy(-350, 0)
}

function scrollr() {
    var right = document.querySelector(".scroll-images");
    right.scrollBy(350, 0)
}


async function fetchCertificates() {
    try {
        const response = await fetch('./data/certificates.json');
        const data = await response.json();

        const certificatesContainer = document.getElementById('certificates-container');

        data.forEach(item => {

        const certificateDiv = document.createElement('div');
        certificateDiv.classList.add('child');

        const img = document.createElement('img');
        img.classList.add('child-img');
        img.src = item['image path'];
        img.alt = item['image alt'];

        const textDiv = document.createElement('div');
        textDiv.classList.add('text');

        const link = document.createElement('a');
        link.href = item['certificate url'];
        link.target = '_blank';
        link.classList.add('text');

        const titleParagraph = document.createElement('p');
        titleParagraph.textContent = item.title;

        link.appendChild(titleParagraph);
        textDiv.appendChild(link);
        certificateDiv.appendChild(img);
        certificateDiv.appendChild(textDiv);
        certificatesContainer.appendChild(certificateDiv);
        });
    } catch (error) {
        console.error('Error fetching JSON data:', error);
    }
}

fetchCertificates();



async function fetchPublications() {
    try {
        const response = await fetch('./data/publications.json');
        const data = await response.json();

        const paperListContainer = document.getElementById('paperList');

        if (data.length === 0) {
            const noPublicationsDiv = document.createElement('div');
            noPublicationsDiv.classList.add('paper');

            const noPublicationsHeading = document.createElement('h3');

            const noPublicationsParagraph = document.createElement('p');
            noPublicationsParagraph.style.textDecoration = 'none';
            noPublicationsParagraph.style.color = '#bdc2d3';
            noPublicationsParagraph.style.fontFamily = 'Inconsolata';
            noPublicationsParagraph.style.fontSize = '20px';
            noPublicationsParagraph.style.display = 'flex';
            noPublicationsParagraph.style.alignItems = 'center';
            noPublicationsParagraph.style.justifyContent = 'center';
            noPublicationsParagraph.textContent = 'No Publications Now';

            noPublicationsHeading.appendChild(noPublicationsParagraph);
            noPublicationsDiv.appendChild(noPublicationsHeading);
            paperListContainer.appendChild(noPublicationsDiv);
        } else {
            data.forEach(paper => {
                const paperDiv = document.createElement('div');
                paperDiv.classList.add('paper');

                const paperNameHeading = document.createElement('h3');
                paperNameHeading.classList.add('paper-name');
                
                const paperNameParagraph = document.createElement('p');

                const paperNameLink = document.createElement('a');
                paperNameLink.classList.add('paper-name')
                paperNameLink.href = paper.url || '#';
                paperNameLink.target = '_blank';
                paperNameLink.textContent = paper.name;

                paperNameParagraph.appendChild(paperNameLink);
                paperNameHeading.appendChild(paperNameParagraph);
                paperDiv.appendChild(paperNameHeading);


                const paperTagDiv = document.createElement('div');
                paperTagDiv.classList.add('paper-tag-div');

                const paperTagSpan = document.createElement('span');
                paperTagSpan.classList.add('paper-tag');

                const paperTagList = document.createElement('li');
                paperTagList.style.fontSize = '12px';
                paperTagList.textContent = paper.tag;

                paperTagSpan.appendChild(paperTagList);
                paperTagDiv.appendChild(paperTagSpan);
                paperDiv.appendChild(paperTagDiv);

                const infoParagraph = document.createElement('p');
                infoParagraph.classList.add('paper-info');
                infoParagraph.style.fontSize = '15px';
                
                // infoParagraph.innerHTML = `<me style="color: #ae6de3;">Mohammed Khalil</me>, ${paper['other']}`;

                // new code
                const full_name = "Mohammed Khalil";
                const regex = new RegExp(`\\b${full_name}\\b`, 'g');
                const replacement = `<me style="color: #ae6de3;">${full_name}</me>`;
                const oreg_text = paper['other']

                const updatedText = oreg_text.replace(regex, replacement);
                infoParagraph.innerHTML = updatedText
                // new code

                paperDiv.appendChild(infoParagraph);

                paperListContainer.appendChild(paperDiv);
            });
        }
    } catch (error) {
        console.error('Error fetching data:', error);
    }
}

fetchPublications();



async function fetchProjects() {
    try {
        const response = await fetch('./data/OtherProjects.json');
        const data = await response.json();

        const projectsContainer = document.getElementById('projects-container');

        data.forEach(project => {
            const projectDiv = document.createElement('div');
            projectDiv.classList.add('small');

            const folderImg = document.createElement('img');
            folderImg.classList.add('folder');
            folderImg.src = './src/img/folder.png';
            folderImg.alt = 'Folder icon';

            const title = document.createElement('h3');
            title.classList.add('proj-name');
            title.textContent = project.title;

            const description = document.createElement('p');
            description.classList.add('p-proj');
            description.textContent = project.container;

            const frameworkImg = document.createElement('img');
            frameworkImg.src = project['image src'];
            frameworkImg.alt = project['image alt'];
            frameworkImg.style = project['image style'];

            const projectLink = document.createElement('a');
            projectLink.href = project.url;
            projectLink.target = '_blank';
            projectLink.classList.add('link');

            projectLink.appendChild(folderImg);
            projectLink.appendChild(title);
            projectLink.appendChild(description);
            projectLink.appendChild(frameworkImg);

            projectDiv.appendChild(projectLink);
            projectsContainer.appendChild(projectDiv);
        });
    } catch (error) {
        console.error('Error fetching and displaying projects:', error);
    }
}

fetchProjects();



async function fetchDatasets() {
    try {
        const response = await fetch('./data/datasets.json');
        const data = await response.json();
        const datasetContainer = document.getElementById('datasetList');

        if (data.length === 0) {
            const noPublicationsDiv = document.createElement('div');
            noPublicationsDiv.classList.add('paper');

            const noPublicationsHeading = document.createElement('h3');

            const noPublicationsParagraph = document.createElement('p');
            noPublicationsParagraph.style.textDecoration = 'none';
            noPublicationsParagraph.style.color = '#bdc2d3';
            noPublicationsParagraph.style.fontFamily = 'Inconsolata';
            noPublicationsParagraph.style.fontSize = '20px';
            noPublicationsParagraph.style.display = 'flex';
            noPublicationsParagraph.style.alignItems = 'center';
            noPublicationsParagraph.style.justifyContent = 'center';
            noPublicationsParagraph.textContent = 'No Datasets Available.';

            noPublicationsHeading.appendChild(noPublicationsParagraph);
            noPublicationsDiv.appendChild(noPublicationsHeading);
            paperListContainer.appendChild(noPublicationsDiv);
        } else {
            data.forEach(dataset => {
                const datasetDiv = document.createElement('div');
                datasetDiv.classList.add('dataset-side-by-side');

                const paperDiv = document.createElement('div');
                paperDiv.classList.add('paper');

                const flexContainer = document.createElement('div');
                flexContainer.classList.add('flex-container');

                const datasetImage = document.createElement('img');
                datasetImage.classList.add('dataset-image');
                datasetImage.src = dataset.image;
                datasetImage.alt = dataset.name;

                const textContainer = document.createElement('div');
                textContainer.classList.add('text-container');

                const datasetNameHeading = document.createElement('h3');
                datasetNameHeading.classList.add('paper-name');

                const datasetNameLink = document.createElement('a');
                datasetNameLink.classList.add('paper-name');
                datasetNameLink.href = dataset.url;
                datasetNameLink.target = '_blank';
                datasetNameLink.textContent = dataset.name;

                datasetNameHeading.appendChild(datasetNameLink);

                const datasetInfo = document.createElement('p');
                datasetInfo.classList.add('paper-info');
                datasetInfo.style.fontSize = '15px';
                datasetInfo.textContent = dataset.container;

                textContainer.appendChild(datasetNameHeading);
                textContainer.appendChild(datasetInfo);

                flexContainer.appendChild(datasetImage);
                flexContainer.appendChild(textContainer);

                paperDiv.appendChild(flexContainer);
                datasetDiv.appendChild(paperDiv);

                datasetContainer.appendChild(datasetDiv);
            });
        }
    } catch (error) {
        console.error('Error fetching data:', error);
    }
}

fetchDatasets();
