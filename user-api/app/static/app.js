(function () {
  const PAGE_SIZE = 20;
  let currentOffset = 0;
  let totalCount = 0;
  let debounceTimer = null;

  const searchInput = document.getElementById("search-input");
  const roleFilter = document.getElementById("role-filter");
  const tbody = document.getElementById("users-body");
  const pagination = document.getElementById("pagination");
  const userCount = document.getElementById("user-count");
  const emptyState = document.getElementById("empty-state");
  const table = document.getElementById("users-table");

  searchInput.addEventListener("input", function () {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function () {
      currentOffset = 0;
      fetchUsers();
    }, 300);
  });

  roleFilter.addEventListener("change", function () {
    currentOffset = 0;
    fetchUsers();
  });

  function buildUrl() {
    var params = new URLSearchParams();
    params.set("limit", PAGE_SIZE);
    params.set("offset", currentOffset);

    var search = searchInput.value.trim();
    if (search) params.set("search", search);

    var role = roleFilter.value;
    if (role) params.set("role", role);

    return "/users?" + params.toString();
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function formatDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function renderTable(users) {
    if (users.length === 0) {
      table.style.display = "none";
      emptyState.style.display = "block";
      return;
    }
    table.style.display = "";
    emptyState.style.display = "none";

    var html = "";
    for (var i = 0; i < users.length; i++) {
      var u = users[i];
      var roleClass = "role-" + u.role;
      var statusClass = u.is_active ? "active" : "inactive";
      var statusText = u.is_active ? "Active" : "Inactive";

      html += "<tr>" +
        "<td>" + u.id + "</td>" +
        "<td>" + escapeHtml(u.username) + "</td>" +
        "<td>" + escapeHtml(u.full_name) + "</td>" +
        "<td>" + escapeHtml(u.email) + "</td>" +
        '<td><span class="role-badge ' + roleClass + '">' + escapeHtml(u.role) + "</span></td>" +
        '<td><div class="status-cell"><span class="status-dot ' + statusClass + '"></span>' +
        '<span class="status-label ' + statusClass + '">' + statusText + "</span></div></td>" +
        "<td>" + formatDate(u.created_at) + "</td>" +
        "</tr>";
    }
    tbody.innerHTML = html;
  }

  function renderPagination() {
    var totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    var currentPage = Math.floor(currentOffset / PAGE_SIZE) + 1;

    if (totalPages <= 1) {
      pagination.innerHTML = "";
      return;
    }

    var html = '<button class="page-btn" onclick="window.__goPage(' + (currentPage - 1) + ')"' +
      (currentPage <= 1 ? " disabled" : "") + '>&laquo;</button>';

    for (var p = 1; p <= totalPages; p++) {
      html += '<button class="page-btn' + (p === currentPage ? " active" : "") +
        '" onclick="window.__goPage(' + p + ')">' + p + "</button>";
    }

    html += '<button class="page-btn" onclick="window.__goPage(' + (currentPage + 1) + ')"' +
      (currentPage >= totalPages ? " disabled" : "") + '>&raquo;</button>';

    html += '<span class="page-info">' + totalCount + " total</span>";

    pagination.innerHTML = html;
  }

  window.__goPage = function (page) {
    var totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    if (page < 1 || page > totalPages) return;
    currentOffset = (page - 1) * PAGE_SIZE;
    fetchUsers();
  };

  window.fetchUsers = function () {
    var url = buildUrl();
    fetch(url)
      .then(function (resp) {
        var hdr = resp.headers.get("X-Total-Count");
        if (hdr !== null) totalCount = parseInt(hdr, 10);
        return resp.json();
      })
      .then(function (users) {
        userCount.textContent = totalCount + " user" + (totalCount !== 1 ? "s" : "");
        renderTable(users);
        renderPagination();
      })
      .catch(function (err) {
        console.error("Failed to fetch users:", err);
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#ef4444;">Failed to load users</td></tr>';
      });
  };

  fetchUsers();
})();
