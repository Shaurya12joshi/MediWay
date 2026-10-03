# 🩺 MediWay

> **Healthcare, wherever you travel.**

MediWay is a healthcare discovery web application designed to help users find **doctors, hospitals, clinics, and pharmacies near their location**.

The idea behind MediWay is especially useful for **travelers and people who are away from home** and may not know where to find suitable healthcare nearby.

The application provides a simple interface to search for healthcare providers, filter results according to different requirements, and explore them through a list or map-based view.

---

## ✨ Features

### 🔎 Healthcare Search

Search for healthcare providers using terms such as:

* Doctor
* Specialty
* Hospital
* Clinic

### 📍 Location-Based Discovery

Users can provide their location to discover healthcare services nearby.

MediWay is designed to make finding healthcare easier when you're unfamiliar with the area.

### 🧑‍⚕️ Healthcare Filters

Results can be filtered based on:

* Provider type
* Medical specialty
* Distance
* Rating
* Language
* Open now
* Walk-in availability
* English-speaking providers
* Insurance acceptance

### 🗺️ List & Map Views

Switch between:

* **List View** — Browse healthcare providers through detailed cards.
* **Map View** — Explore healthcare locations visually on a map.

### 🚨 Emergency Mode

MediWay includes an emergency-focused interface that provides quick access to nearby emergency services and includes an SOS interaction.

### 👤 Authentication & Profile

The project includes authentication and profile-related pages for users.

### 📱 Responsive Interface

The UI is designed to work across different screen sizes, including desktop and mobile layouts.

---

## 🛠️ Tech Stack

| Technology       | Purpose                              |
| ---------------- | ------------------------------------ |
| **React**        | User interface                       |
| **React Router** | Pages and clean URLs (`/search`, `/profile?id=…`) |
| **Redux Toolkit**| App state, and Supabase data via RTK Query |
| **JavaScript**   | Application logic and interactions   |
| **Tailwind CSS** | Styling and responsive UI            |
| **Vite**         | Development server and build tooling |
| **Supabase**     | Backend/database integration         |
| **Mappls**       | Map and location functionality       |
| **Git & GitHub** | Version control                      |

---

## 📂 Project Structure

```text
MediWay/
│
├── public/              # Files served as-is (favicon)
│
├── src/
│   ├── main.jsx         # Entry: Redux store + router
│   ├── router.jsx       # Routes, and redirects from the old .html addresses
│   ├── index.css        # Tailwind input stylesheet
│   ├── assets/          # Images bundled by Vite
│   ├── lib/             # Supabase client, location and opening-hours helpers
│   ├── store/           # Redux Toolkit store, slices and RTK Query API
│   ├── components/      # Shared UI (footer, icons, toast…)
│   └── pages/
│       ├── Home.jsx         # /         Landing page
│       ├── search/          # /search   Search, filters, map and directions
│       ├── Profile.jsx      # /profile  Doctor profile and reviews
│       ├── Review.jsx       # /review   Write a review
│       ├── Auth.jsx         # /auth     Sign in, waitlist, invite setup
│       └── admin/           # /admin    Review proofs, imported places, hours
│
├── scripts/             # Data import scripts (Node)
├── supabase/            # SQL migrations
├── dist/                # Build output
│
├── index.html           # The single HTML page React renders into
├── netlify.toml         # Build settings and SPA routing for Netlify
│
├── package.json
├── package-lock.json
├── tailwind.config.js
├── postcss.config.js
├── vite.config.js
└── README.md
```

---

## 🚀 Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/Shaurya12joshi/MediWay.git
```

### 2. Move into the project directory

```bash
cd MediWay
```

### 3. Install dependencies

```bash
npm install
```

### 4. Start the development server

```bash
npm run dev
```

Vite will start the local development server.

Open the URL shown in your terminal to view the application.

---

## 🏗️ Build for Production

To create a production build:

```bash
npm run build
```

---

## 🎯 Project Goal

MediWay was built around a simple problem:

> **Finding reliable healthcare in an unfamiliar place shouldn't be difficult.**

When traveling or staying in a new city, people may not know which doctors, hospitals, clinics, or pharmacies are nearby.

MediWay aims to bring these options together in a single, easy-to-use interface so users can quickly discover healthcare services around them.

---

## 🧠 What I Learned

While building MediWay, I worked with and learned more about:

* Building responsive web interfaces
* Tailwind CSS
* JavaScript DOM manipulation
* Search and filtering logic
* Location-based functionality
* Map integration
* UI state changes
* Authentication flows
* Supabase integration
* Responsive navigation
* Designing for emergency-focused user flows
* Structuring a multi-page web application
* Using Vite for modern frontend development

---

## 🚧 Current Status

MediWay is an **ongoing project**.

The current repository contains the core UI and functionality for the healthcare discovery experience, with further improvements and integrations planned as development continues.

---

## 🔮 Future Improvements

Some areas that can be expanded in future versions include:

* More comprehensive healthcare provider data
* Real-time availability
* Appointment booking
* More advanced location-based recommendations
* Improved emergency-service integration
* More detailed doctor profiles
* User reviews and ratings
* Better authentication and account management
* Additional cities and healthcare providers

---

## 👨‍💻 Author

**Shaurya Joshi**

Computer Science & Engineering Student

GitHub: [@Shaurya12joshi](https://github.com/Shaurya12joshi)

---

## ⭐ Support

If you find the project interesting, consider giving the repository a ⭐ on GitHub.

---

## 📄 License

This project is currently available for learning and development purposes.
