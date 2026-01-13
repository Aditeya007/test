// src/components/Pagination.js

import React from 'react';
import '../styles/index.css';

function Pagination({ currentPage, totalPages, onPageChange, totalCount, limit }) {
  // Always show pagination info, even if only 1 page (to show count)
  // But only show navigation controls if there's more than 1 page
  const showNavigation = totalPages > 1;

  const startItem = (currentPage - 1) * limit + 1;
  const endItem = Math.min(currentPage * limit, totalCount);

  const handlePrevious = () => {
    if (currentPage > 1) {
      onPageChange(currentPage - 1);
    }
  };

  const handleNext = () => {
    if (currentPage < totalPages) {
      onPageChange(currentPage + 1);
    }
  };

  const handlePageClick = (page) => {
    if (page !== currentPage && page >= 1 && page <= totalPages) {
      onPageChange(page);
    }
  };

  // Generate page numbers to display
  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;
    
    if (totalPages <= maxVisible) {
      // Show all pages if total is less than max visible
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Show pages with ellipsis
      if (currentPage <= 3) {
        // Show first pages
        for (let i = 1; i <= 4; i++) {
          pages.push(i);
        }
        pages.push('ellipsis');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        // Show last pages
        pages.push(1);
        pages.push('ellipsis');
        for (let i = totalPages - 3; i <= totalPages; i++) {
          pages.push(i);
        }
      } else {
        // Show middle pages
        pages.push(1);
        pages.push('ellipsis');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pages.push(i);
        }
        pages.push('ellipsis');
        pages.push(totalPages);
      }
    }
    
    return pages;
  };

  return (
    <div className="pagination-container">
      <div className="pagination-info">
        Showing {startItem} to {endItem} of {totalCount} users
      </div>
      {showNavigation && (
        <div className="pagination-controls">
          <button
            type="button"
            className="pagination-btn"
            onClick={handlePrevious}
            disabled={currentPage === 1}
            title="Previous page"
          >
            ← Previous
          </button>
          
          <div className="pagination-pages">
            {getPageNumbers().map((page, index) => {
              if (page === 'ellipsis') {
                return (
                  <span key={`ellipsis-${index}`} className="pagination-ellipsis">
                    ...
                  </span>
                );
              }
              return (
                <button
                  key={page}
                  type="button"
                  className={`pagination-page-btn ${page === currentPage ? 'active' : ''}`}
                  onClick={() => handlePageClick(page)}
                  title={`Go to page ${page}`}
                >
                  {page}
                </button>
              );
            })}
          </div>
          
          <button
            type="button"
            className="pagination-btn"
            onClick={handleNext}
            disabled={currentPage === totalPages}
            title="Next page"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

export default Pagination;
