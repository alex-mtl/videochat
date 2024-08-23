let regionNames = new Intl.DisplayNames(['en'], {type: 'region'});
let countryCodes = [
    'AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AR', 'AS', 'AT', 'AU', 'AW', 'AX', 'AZ',
    'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ', 'BR',
    'BS', 'BT', 'BV', 'BW', 'BY', 'BZ', 'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL',
    'CM', 'CN', 'CO', 'CR', 'CU', 'CV', 'CW', 'CX', 'CY', 'CZ', 'DE', 'DJ', 'DK', 'DM', 'DO',
    'DZ', 'EC', 'EE', 'EG', 'EH', 'ER', 'ES', 'ET', 'FI', 'FJ', 'FM', 'FO', 'FR', 'GA', 'GB',
    'GD', 'GE', 'GF', 'GG', 'GH', 'GI', 'GL', 'GM', 'GN', 'GP', 'GQ', 'GR', 'GT', 'GU', 'GW',
    'GY', 'HK', 'HM', 'HN', 'HR', 'HT', 'HU', 'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ', 'IR',
    'IS', 'IT', 'JE', 'JM', 'JO', 'JP', 'KE', 'KG', 'KH', 'KI', 'KM', 'KN', 'KP', 'KR', 'KW',
    'KY', 'KZ', 'LA', 'LB', 'LC', 'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY', 'MA', 'MC',
    'MD', 'ME', 'MF', 'MG', 'MH', 'MK', 'ML', 'MM', 'MN', 'MO', 'MP', 'MQ', 'MR', 'MS', 'MT',
    'MU', 'MV', 'MW', 'MX', 'MY', 'MZ', 'NA', 'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP',
    'NR', 'NU', 'NZ', 'OM', 'PA', 'PE', 'PF', 'PG', 'PH', 'PK', 'PL', 'PM', 'PN', 'PR', 'PT',
    'PW', 'PY', 'QA', 'RE', 'RO', 'RS', 'RU', 'RW', 'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH',
    'SI', 'SJ', 'SK', 'SL', 'SM', 'SN', 'SO', 'SR', 'SS', 'ST', 'SV', 'SX', 'SY', 'SZ', 'TC',
    'TD', 'TF', 'TG', 'TH', 'TJ', 'TK', 'TL', 'TM', 'TN', 'TO', 'TR', 'TT', 'TV', 'TZ', 'UA',
    'UG', 'UM', 'US', 'UY', 'UZ', 'VA', 'VC', 'VE', 'VG', 'VI', 'VN', 'VU', 'WF', 'WS', 'XK',
    'YE', 'YT', 'ZA', 'ZM', 'ZW'
];

const select = document.getElementById('countrySelect');
function countryOptions(elem, selected = 'US') {
    countryCodes.forEach(code => {
        const name = regionNames.of(code);
        const option = document.createElement('option');
        option.value = code;
        option.textContent = name;
        if (code === selected) {
            option.selected = true
        }
        elem.appendChild(option);
    });
}
document.getElementById('uploadButton').addEventListener('click', () => {
    const elem = document.getElementById('uploadButton');
    const input = document.getElementById('imageInput');
    const file = input.files[0];

    if (!file) {
        alert('Please select a file first.');
        return;
    }

    const formData = new FormData();
    formData.append('image', file);

    // Send the image to the backend
    fetch('/user/avatar/upload', {
        method: 'POST',
        body: formData
    })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                // Display the error message returned by the backend
                alert(`Failed to upload image: ${data.error}`);
            } else if (data.success) {

                var myModalEl = document.getElementById('uploadModal');
                var modal = bootstrap.Modal.getInstance(myModalEl);
                modal.hide();
                let img = elem.closest('.card-body').querySelector('img')
                img.setAttribute('src', data.avatar)
                let headerImg = document.querySelector('div.header span.user-avatar img')
                headerImg.setAttribute('src', data.avatar)
            } else {
                console.log(data)
                alert('Failed to upload image.');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert('An unexpected error occurred. Please try again.');
        });
});


document.addEventListener('DOMContentLoaded', () => {
    const errorModal = new bootstrap.Modal(document.getElementById('errorModal'));
    const errorMessagesElem = document.getElementById('errorMessages');

    // Function to show the error modal with multiple messages
    function showErrorModal(messages) {
        errorMessagesElem.innerHTML = ''; // Clear existing messages
        messages.forEach(message => {
            const li = document.createElement('li');
            li.textContent = message;
            errorMessagesElem.appendChild(li);
        });
        errorModal.show();
    }

    const form = document.getElementById('editUserForm');

    form.addEventListener('submit', async (event) => {
        event.preventDefault(); // Prevent the default form submission

        // Create a FormData object from the form element
        const formData = new FormData(form);
        const fData = Object.fromEntries(formData.entries());


            // Send the form data to the backend
            const response = await fetch('/user/edit', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(fData),
            });

            const data = await response.json();

            if (response.ok) {
                if (data.error) {
                    showErrorModal(data.details || ['An unexpected error occurred.']);
                } else {
                    const myModalEl = document.getElementById('editUserModal');
                    const modal = bootstrap.Modal.getInstance(myModalEl);
                    modal.hide();
                    for (const [propName, propValue] of Object.entries(data)) {
                        const el = document.querySelector(`p[data-user-attr='user-data-${propName}']`);
                        if (el) {
                            el.textContent = propValue;
                        }
                    }
                }

            } else {
                // Handle error response

                showErrorModal(data.details || ['An unexpected error occurred.']);
                //alert(`Failed to update user information: ${data.error}`);
            }

    });
});
