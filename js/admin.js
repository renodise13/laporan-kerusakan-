window.addEventListener('laporSarprasReady', function () {
  if (document.body.dataset.page === 'admin') renderAdminDashboard();
});

window.addEventListener('laporSarprasReportsUpdated', function () {
  if (document.body.dataset.page === 'admin') renderAdminDashboard();
});

function collectCounts(reports) {
  return {
    total: reports.length,
    waiting: reports.filter((report) => report.status === 'Menunggu').length,
    progress: reports.filter((report) => report.status === 'Sedang Diproses').length,
    done: reports.filter((report) => report.status === 'Selesai').length
  };
}

function renderAdminDashboard() {
  const storage = window.LaporSarprasStorage;
  const currentUser = storage.getCurrentUser();
  if (!currentUser || currentUser.role !== 'admin') {
    return;
  }

  const reports = storage.getReports();
  const counts = collectCounts(reports);

  document.getElementById('adminWelcome').textContent = `Dashboard Admin - ${currentUser?.name || 'Petugas'}`;
  document.getElementById('adminTotal').textContent = counts.total;
  document.getElementById('adminWaiting').textContent = counts.waiting;
  document.getElementById('adminProgress').textContent = counts.progress;
  document.getElementById('adminDone').textContent = counts.done;

  renderMonthlySummary();

  const categoryFilter = document.getElementById('adminCategoryFilter');
  if (categoryFilter) {
    const selectedCategory = categoryFilter.value;
    const categories = [...new Set(reports.map((report) => report.category).filter(Boolean))].sort();
    categoryFilter.innerHTML = '<option value="all">Semua kategori</option>' + categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('');
    categoryFilter.value = categories.includes(selectedCategory) ? selectedCategory : 'all';
  }

  const searchInput = document.getElementById('adminSearch');
  const statusFilter = document.getElementById('adminStatusFilter');
  const tableBody = document.getElementById('adminTableBody');

  function getFilteredReports() {
    const searchValue = (searchInput?.value || '').trim().toLowerCase();
    const selectedStatus = statusFilter?.value || 'all';
    const selectedCategory = categoryFilter?.value || 'all';

    return storage.getReports().filter((report) => {
      const matchedText = !searchValue || [report.ticketNumber, report.itemName, report.location, report.reporterName].some((value) => String(value || '').toLowerCase().includes(searchValue));
      const matchedStatus = selectedStatus === 'all' || report.status === selectedStatus;
      const matchedCategory = selectedCategory === 'all' || report.category === selectedCategory;
      return matchedText && matchedStatus && matchedCategory;
    });
  }

  function renderRows() {
    const filteredReports = getFilteredReports();

    if (!tableBody) {
      return;
    }

    if (!filteredReports.length) {
      tableBody.innerHTML = '<tr><td colspan="8" class="empty-state">Tidak ada laporan yang sesuai dengan filter.</td></tr>';
      return;
    }

    tableBody.innerHTML = filteredReports
      .slice()
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map(
        (report) => `
          <tr>
            <td>${escapeHtml(report.ticketNumber)}</td>
            <td>${escapeHtml(report.reporterName)}</td>
            <td>${escapeHtml(report.itemName)}</td>
            <td>${escapeHtml(report.location)}</td>
            <td>${escapeHtml(report.category)}</td>
            <td><span class="badge ${getStatusClass(report.status)}">${escapeHtml(report.status)}</span></td>
            <td>${formatReportDate(report.createdAt)}</td>
            <td class="admin-report-actions">
              <a href="detail-laporan.html?id=${encodeURIComponent(report.id)}" class="action-link">Detail</a>
              <button type="button" class="delete-report-btn" data-report-id="${escapeHtml(report.id)}">Hapus</button>
            </td>
          </tr>
        `
      )
      .join('');
  }

  [searchInput, statusFilter, categoryFilter].forEach((element) => {
    if (element && element.dataset.adminFilterBound !== 'true') {
      element.addEventListener('input', renderRows);
      element.addEventListener('change', renderRows);
      element.dataset.adminFilterBound = 'true';
    }
  });

  if (tableBody && tableBody.dataset.deleteBound !== 'true') {
    tableBody.addEventListener('click', async function (event) {
      const button = event.target.closest('.delete-report-btn');
      if (!button) return;

      const report = storage.getReports().find((item) => item.id === button.dataset.reportId);
      if (!report || !window.confirm(`Hapus laporan ${report.ticketNumber}? Laporan yang dihapus tidak dapat dikembalikan.`)) {
        return;
      }

      button.disabled = true;
      try {
        await storage.deleteReport(report.id);
        renderAdminDashboard();
      } catch (error) {
        window.alert(error.message || 'Gagal menghapus laporan.');
        button.disabled = false;
      }
    });
    tableBody.dataset.deleteBound = 'true';
  }

  renderRows();
  initLegacyImport(storage);
}

function renderMonthlySummary() {
  const monthFilter = document.getElementById('adminMonthFilter');
  const tableBody = document.getElementById('monthlyTableBody');
  const downloadButton = document.getElementById('downloadMonthlyReport');
  if (!monthFilter || !tableBody || !downloadButton) {
    return;
  }

  const currentMonth = getMonthKey(new Date());

  function getMonthlyReports() {
    return window.LaporSarprasStorage.getReports()
      .filter((report) => getReportDate(report)?.monthKey === monthFilter.value)
      .slice()
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  function renderMonth() {
    const selectedMonth = monthFilter.value;
    const currentReports = window.LaporSarprasStorage.getReports();
    const availableMonths = [...new Set(
      currentReports
        .map((report) => getReportDate(report)?.monthKey)
        .filter(Boolean)
    )];
    if (!availableMonths.includes(currentMonth)) availableMonths.push(currentMonth);
    availableMonths.sort((a, b) => b.localeCompare(a));
    monthFilter.innerHTML = availableMonths
      .map((month) => `<option value="${month}">${formatMonthLabel(month)}</option>`)
      .join('');
    monthFilter.value = availableMonths.includes(selectedMonth) ? selectedMonth : currentMonth;

    const monthlyReports = getMonthlyReports();
    const counts = collectCounts(monthlyReports);
    document.getElementById('monthlyTotal').textContent = counts.total;
    document.getElementById('monthlyWaiting').textContent = counts.waiting;
    document.getElementById('monthlyProgress').textContent = counts.progress;
    document.getElementById('monthlyDone').textContent = counts.done;

    if (!monthlyReports.length) {
      tableBody.innerHTML = '<tr><td colspan="7" class="empty-state">Belum ada laporan pada bulan ini.</td></tr>';
      return;
    }

    tableBody.innerHTML = monthlyReports.map((report) => `
      <tr>
        <td>${escapeHtml(report.ticketNumber)}</td>
        <td>${escapeHtml(report.reporterName)}</td>
        <td>${escapeHtml(report.itemName)}</td>
        <td>${escapeHtml(report.category)}</td>
        <td>${escapeHtml(report.location)}</td>
        <td><span class="badge ${getStatusClass(report.status)}">${escapeHtml(report.status)}</span></td>
        <td>${formatReportDate(report.createdAt)}</td>
      </tr>
    `).join('');
  }

  if (monthFilter.dataset.monthlyBound !== 'true') {
    monthFilter.addEventListener('change', renderMonth);
    downloadButton.addEventListener('click', function () {
      downloadMonthlyExcel(monthFilter.value, getMonthlyReports());
    });
    monthFilter.dataset.monthlyBound = 'true';
  }
  renderMonth();
}

function initLegacyImport(storage) {
  const button = document.getElementById('importLocalReports');
  if (!button || button.dataset.importBound === 'true') return;

  button.addEventListener('click', async function () {
    if (!window.confirm('Laporan lama yang tersimpan di perangkat ini akan dikirim ke database bersama Supabase dan dapat dilihat admin. Lanjutkan?')) {
      return;
    }

    button.disabled = true;
    try {
      const importedCount = await storage.importLegacyReports();
      alert(importedCount
        ? `${importedCount} laporan lama berhasil disinkronkan.`
        : 'Tidak ada laporan baru untuk diimpor dari perangkat ini.');
      renderAdminDashboard();
    } catch (error) {
      alert(error.message || 'Gagal mengimpor laporan lama.');
    } finally {
      button.disabled = false;
    }
  });
  button.dataset.importBound = 'true';
}

function getReportDate(report) {
  const date = new Date(report.createdAt);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return { date, monthKey: getMonthKey(date) };
}

function getMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  return new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' })
    .format(new Date(year, month - 1, 1));
}

function formatReportDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('id-ID');
}

function getStatusClass(status) {
  if (status === 'Menunggu') return 'status-waiting';
  if (status === 'Sedang Diproses') return 'status-processing';
  if (status === 'Selesai') return 'status-done';
  return 'status-waiting';
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function downloadMonthlyExcel(monthKey, reports) {
  const XLSX = window.XLSX;
  if (!XLSX) {
    window.alert('Fitur Excel belum siap. Periksa koneksi internet, lalu muat ulang halaman.');
    return;
  }

  const columns = [
    ['Nomor Tiket', 'ticketNumber'],
    ['Nama Pelapor', 'reporterName'],
    ['Kelas', 'reporterClass'],
    ['Nama Barang', 'itemName'],
    ['Kategori', 'category'],
    ['Lokasi', 'location'],
    ['Prioritas', 'priority'],
    ['Status', 'status'],
    ['Tanggal Masuk', 'createdAt'],
    ['Terakhir Diperbarui', 'updatedAt'],
    ['Deskripsi', 'description'],
    ['Catatan Admin', 'notes']
  ];
  const formatSpreadsheetDate = (value) => {
    const date = new Date(value);
    return value && !Number.isNaN(date.getTime())
      ? new Intl.DateTimeFormat('id-ID', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).format(date)
      : '-';
  };
  const reportRows = reports.map((report) => columns.map(([, key]) => {
    if (key === 'createdAt' || key === 'updatedAt') {
      return formatSpreadsheetDate(report[key]);
    }
    return report[key] == null || report[key] === '' ? '-' : String(report[key]);
  }));
  const summary = collectCounts(reports);
  const worksheetData = [
    ['REKAP LAPORAN KERUSAKAN'],
    [`Periode: ${formatMonthLabel(monthKey)}`],
    [`Total laporan: ${summary.total}  |  Menunggu: ${summary.waiting}  |  Diproses: ${summary.progress}  |  Selesai: ${summary.done}`],
    columns.map(([label]) => label),
    ...reportRows
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
  const lastColumn = XLSX.utils.encode_col(columns.length - 1);
  const lastRow = worksheetData.length;

  worksheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: columns.length - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: columns.length - 1 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: columns.length - 1 } }
  ];
  worksheet['!cols'] = [
    { wch: 23 }, { wch: 24 }, { wch: 15 }, { wch: 25 },
    { wch: 18 }, { wch: 24 }, { wch: 14 }, { wch: 20 },
    { wch: 24 }, { wch: 24 }, { wch: 48 }, { wch: 48 }
  ];
  worksheet['!rows'] = [
    { hpt: 30 }, { hpt: 23 }, { hpt: 23 }, { hpt: 30 },
    ...reportRows.map(() => ({ hpt: 42 }))
  ];
  worksheet['!autofilter'] = { ref: `A4:${lastColumn}${lastRow}` };

  const border = {
    top: { style: 'thin', color: { rgb: 'D9E2F3' } },
    bottom: { style: 'thin', color: { rgb: 'D9E2F3' } },
    left: { style: 'thin', color: { rgb: 'D9E2F3' } },
    right: { style: 'thin', color: { rgb: 'D9E2F3' } }
  };
  const headerStyle = {
    fill: { patternType: 'solid', fgColor: { rgb: '143C66' } },
    font: { bold: true, color: { rgb: 'FFFFFF' } },
    alignment: { vertical: 'center', horizontal: 'center', wrapText: true },
    border
  };

  for (let column = 0; column < columns.length; column += 1) {
    const headerAddress = XLSX.utils.encode_cell({ r: 3, c: column });
    worksheet[headerAddress].s = headerStyle;

    for (let row = 4; row < lastRow; row += 1) {
      const address = XLSX.utils.encode_cell({ r: row, c: column });
      const cell = worksheet[address];
      cell.s = {
        fill: { patternType: 'solid', fgColor: { rgb: row % 2 === 0 ? 'F5F7FB' : 'FFFFFF' } },
        alignment: { vertical: 'top', wrapText: true },
        border
      };
      if (column === 7) {
        const statusColors = {
          Menunggu: 'FFF2CC',
          'Sedang Diproses': 'DDEBF7',
          Selesai: 'E2F0D9'
        };
        cell.s.fill = {
          patternType: 'solid',
          fgColor: { rgb: statusColors[cell.v] || 'F5F7FB' }
        };
        cell.s.font = { bold: true, color: { rgb: '243247' } };
        cell.s.alignment = { vertical: 'center', horizontal: 'center', wrapText: true };
      }
    }
  }

  worksheet.A1.s = {
    fill: { patternType: 'solid', fgColor: { rgb: '0B1F3A' } },
    font: { bold: true, sz: 16, color: { rgb: 'FFFFFF' } },
    alignment: { vertical: 'center', horizontal: 'left' }
  };
  worksheet.A2.s = {
    font: { italic: true, color: { rgb: '64748B' } },
    alignment: { vertical: 'center' }
  };
  worksheet.A3.s = {
    fill: { patternType: 'solid', fgColor: { rgb: 'EEF6FF' } },
    font: { bold: true, color: { rgb: '143C66' } },
    alignment: { vertical: 'center' }
  };

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, `Rekap ${monthKey}`);
  workbook.Props = {
    Title: `Rekap Laporan Kerusakan ${formatMonthLabel(monthKey)}`,
    Subject: 'Rekap laporan kerusakan',
    Author: 'Laporan Kerusakan'
  };
  try {
    XLSX.writeFile(workbook, `rekap-laporan-${monthKey}.xlsx`, { compression: true });
  } catch (error) {
    window.alert(error.message || 'Gagal membuat file Excel. Silakan coba lagi.');
  }
}
