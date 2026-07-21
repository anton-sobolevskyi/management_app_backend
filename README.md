# 📊 Management App — Backend Service

A robust, scalable, and secure RESTful API for a Task & Management Application built with **NestJS**, **TypeScript**, and modern backend tools.

---

## 🚀 Tech Stack & Tools

* **Framework:** [NestJS](https://nestjs.com/) (Node.js)
* **Language:** TypeScript
* **Database:** PostgreSQL
* **ORM:** Prisma
* **Authentication:** JWT (JSON Web Tokens) & Passport.js
* **Validation & Transformation:** `class-validator`, `class-transformer`
* **API Documentation:** Swagger / OpenAPI

---

## ✨ Features

* 🔐 **Authentication & Authorization:**
  * Secure user registration and login (Password hashing with `bcrypt`).
  * JWT-based authentication via Guard/Strategy pattern.
  * Role-Based Access Control (RBAC) *(e.g., Admin, User, Manager)*.

* 📋 **Task & Resource Management:**
  * Full CRUD operations for managing tasks, projects, and users.
  * Filtering, sorting, and pagination for task/resource lists.

* 🛠 **Architecture & Best Practices:**
  * Modular NestJS architecture (Separation of Concerns).
  * Data Transfer Objects (DTO) with strict validation.
  * Global exception filters and interceptors for standardized API responses.
